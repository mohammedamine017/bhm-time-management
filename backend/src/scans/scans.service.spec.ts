import { ScansService } from './scans.service';

describe('ScansService', () => {
  it('extracts every uploaded document sequentially', async () => {
    let activeExtractions = 0;
    let maximumConcurrentExtractions = 0;
    let documentNumber = 0;

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
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'batch-1',
            status: 'EXTRACTED',
            documents: [],
          },
        ]),
      },
      scanDocument: {
        create: jest.fn().mockImplementation(async () => ({
          id: `document-${++documentNumber}`,
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      extractedTimeSheetRow: {
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
              employeeId: 'employee-1',
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

    await service.upload(files);

    expect(claude.extract).toHaveBeenCalledTimes(2);
    expect(maximumConcurrentExtractions).toBe(1);
    const persistedRow =
      prisma.extractedTimeSheetRow.createMany.mock.calls[0][0].data[0];
    expect(persistedRow.days.map((day: { needsReview: boolean }) => day.needsReview))
      .toEqual([false, true, false]);
    expect(persistedRow.requiresReview).toBe(true);
    expect(persistedRow.hasTimeClockCode).toBe(true);
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
    expect(result.hasTimeClockCode).toBe(true);
  });
});
