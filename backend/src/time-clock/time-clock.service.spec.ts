import { TimeClockService } from './time-clock.service';

describe('TimeClockService', () => {
  it('calcule aussi un employé pointeuse absent de la liste visible', async () => {
    const externalEmployee = {
      id: 'external-1',
      matricule: 'PNT-123',
      firstName: 'Employé Administration',
      lastName: '',
      normalizedFullName: 'EMPLOYE ADMINISTRATION',
      isExternal: true,
      listImportId: 'list-1',
    };
    const prisma = {
      employeeListImport: {
        findFirst: jest.fn().mockResolvedValue({ id: 'list-1' }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(externalEmployee),
      },
      timeClockReport: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'report-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TimeClockService(
      prisma as never,
      {
        getOrCreateActive: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          payrollMonth: '2026-07',
        }),
      } as never,
      {
        parse: jest.fn().mockReturnValue([
          {
            sourceEmployeeNumber: '4',
            sourceFullName: 'Employé Administration',
            days: [],
            requiresReview: false,
          },
        ]),
      } as never,
      {
        store: jest.fn().mockResolvedValue({
          storageUrl: null,
          storageKey: 'time-clock/report.xls',
        }),
      } as never,
      {} as never,
    );

    await service.import([
      {
        originalname: 'rapport.xls',
        mimetype: 'application/vnd.ms-excel',
        buffer: Buffer.from('rapport'),
      },
    ]);

    expect(prisma.employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isExternal: true,
        listImportId: 'list-1',
      }),
    });
    expect(prisma.timeClockReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employees: {
          create: [
            expect.objectContaining({
              employeeId: 'external-1',
              requiresReview: false,
            }),
          ],
        },
      }),
    });
  });
});
