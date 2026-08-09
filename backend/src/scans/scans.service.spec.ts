import { ScansService } from './scans.service';

describe('ScansService', () => {
  it('extracts every uploaded document sequentially', async () => {
    let activeExtractions = 0;
    let maximumConcurrentExtractions = 0;
    let documentNumber = 0;
    const storedDocuments = new Map<string, Record<string, any>>();

    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'employee-1',
            matricule: 'BHM-001',
            firstName: 'Ahmed',
            lastName: 'Benali',
          },
        ]),
      },
      scanBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockImplementation(async () => [
          {
            id: 'batch-1',
            status: 'PROCESSING',
            documents: [...storedDocuments.values()],
          },
        ]),
      },
      scanDocument: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          const document = {
            id: `document-${++documentNumber}`,
            uploadedAt: new Date(),
            extractedRows: [],
            ...data,
          };
          storedDocuments.set(document.id, document);
          return document;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          const document = storedDocuments.get(where.id);
          if (!document || (where.status && document.status !== where.status)) {
            return { count: 0 };
          }
          Object.assign(document, data);
          return { count: 1 };
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          const document = storedDocuments.get(where.id);
          return document
            ? {
                ...document,
                batch: {
                  cycleId: 'cycle-1',
                  cycle: {
                    startDate: new Date('2026-06-20'),
                    endDate: new Date('2026-07-19'),
                  },
                },
              }
            : null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }) =>
          [...storedDocuments.values()]
            .filter((document) => document.batchId === where.batchId)
            .map((document) => ({ status: document.status })),
        ),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const document = storedDocuments.get(where.id)!;
          Object.assign(document, data);
          return { ...document, extractedRows: [] };
        }),
      },
      extractedTimeSheetRow: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
    };
    const cycles = {
      getOrCreateActive: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        payrollMonth: '2026-07',
        startDate: new Date('2026-06-20'),
        endDate: new Date('2026-07-19'),
      }),
    };
    const storage = {
      store: jest.fn().mockResolvedValue({
        storageUrl: 'https://example.test/file',
        storageKey: 'file',
      }),
      read: jest.fn().mockImplementation(async (document) => ({
        originalname: document.fileName,
        mimetype: document.mimeType,
        buffer: Buffer.from('file'),
      })),
    };
    const claude = {
      extract: jest.fn().mockImplementation(async () => {
        activeExtractions += 1;
        maximumConcurrentExtractions = Math.max(
          maximumConcurrentExtractions,
          activeExtractions,
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeExtractions -= 1;
        return {
          rows: [
            {
              matricule: 'BHM-001',
              extractedFullName: 'Ahmed Benali',
              matchedFullName: 'Ahmed Benali',
              sourceRowLabel: null,
              requiresReview: true,
              days: [
                {
                  date: '2026-06-20',
                  value: '8',
                  confidence: 0.7,
                  needsReview: true,
                },
                {
                  date: '2026-06-21',
                  value: 'T',
                  confidence: 0.6,
                  needsReview: false,
                },
                {
                  date: '2026-06-22',
                  value: '',
                  confidence: 0.2,
                  needsReview: true,
                },
              ],
            },
          ],
        };
      }),
    };
    const service = new ScansService(
      prisma as never,
      cycles as never,
      storage as never,
      claude as never,
      { recalculateIfExists: jest.fn() } as never,
    );
    const files = ['one.jpg', 'two.pdf'].map((originalname, index) => ({
      originalname,
      buffer: Buffer.from('file'),
      mimetype: index ? 'application/pdf' : 'image/jpeg',
      size: 4,
    }));

    const result = await service.upload(files);

    expect(result.status).toBe('PROCESSING');
    expect(claude.extract).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(claude.extract).toHaveBeenCalledTimes(2);
    expect(maximumConcurrentExtractions).toBe(1);
    const persistedRow =
      prisma.extractedTimeSheetRow.createMany.mock.calls[0][0].data[0];
    expect(persistedRow.days.map((day: { needsReview: boolean }) => day.needsReview))
      .toEqual([false, true, false]);
    expect(persistedRow.requiresReview).toBe(true);
    expect(persistedRow.employeeId).toBe('employee-1');
  });

  it('requeues only the failed document requested by the user', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateDocument = jest.fn().mockResolvedValue({
      id: 'document-1',
      batchId: 'batch-1',
      status: 'PENDING',
      extractedRows: [],
    });
    const updateBatch = jest.fn().mockResolvedValue({});
    const prisma = {
      scanDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'document-1',
          batchId: 'batch-1',
          status: 'FAILED',
          extractedRows: [],
        }),
        update: updateDocument,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      scanBatch: { update: updateBatch },
      extractedTimeSheetRow: { deleteMany },
      $transaction: jest
        .fn()
        .mockImplementation(async (operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
    };
    const service = new ScansService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.retryDocument('document-1')).resolves.toMatchObject({
      id: 'document-1',
      status: 'PENDING',
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'document-1' },
    });
    expect(updateBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    );
  });

  it('validates an edited day and recalculates the row state', async () => {
    const update = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'row-1',
      employeeId: 'employee-1',
      ...data,
    }));
    const prisma = {
      extractedTimeSheetRow: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'row-1',
          employeeId: 'employee-1',
          document: { batch: { cycleId: 'cycle-1' } },
          days: [
            {
              date: '2026-06-20',
              value: 'T',
              confidence: 0.5,
              needsReview: true,
            },
            {
              date: '2026-06-21',
              value: '8',
              confidence: 0.8,
              needsReview: false,
            },
          ],
        }),
        update,
      },
    };
    const service = new ScansService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { recalculateIfExists: jest.fn() } as never,
    );

    const result = await service.updateDay('row-1', '2026-06-20', 'T');

    expect(result.days[0]).toEqual({
      date: '2026-06-20',
      value: 'T',
      confidence: 1,
      needsReview: false,
    });
    expect(result.requiresReview).toBe(false);
  });
});
