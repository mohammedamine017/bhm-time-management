import { TimeClockService } from './time-clock.service';

describe('TimeClockService', () => {
  const externalEmployee = {
    id: 'external-1',
    matricule: 'PNT-123',
    firstName: 'Employé Administration',
    lastName: '',
    normalizedFullName: 'EMPLOYE ADMINISTRATION',
    isExternal: true,
    listImportId: 'list-1',
  };

  const day = (date: string) => ({
    date,
    punches: ['08:00:00', '16:00:00'],
    durationMinutes: 510,
    state: 'WORKED' as const,
    stateLabel: '',
    needsReview: false,
  });

  const build = (days: ReturnType<typeof day>[]) => {
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
    const files = {
      store: jest.fn().mockResolvedValue({
        storageUrl: null,
        storageKey: 'time-clock/report.xls',
      }),
    };
    const service = new TimeClockService(
      prisma as never,
      {
        getOrCreateActive: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          payrollMonth: '2026-07',
          startDate: new Date('2026-06-20T00:00:00.000Z'),
          endDate: new Date('2026-07-19T00:00:00.000Z'),
        }),
      } as never,
      {
        parse: jest.fn().mockReturnValue([
          {
            sourceEmployeeNumber: '4',
            sourceFullName: 'Employé Administration',
            days,
            requiresReview: false,
          },
        ]),
      } as never,
      files as never,
      {} as never,
    );
    return { service, prisma, files };
  };

  const upload = {
    originalname: 'rapport.xls',
    mimetype: 'application/vnd.ms-excel',
    buffer: Buffer.from('rapport'),
  };

  it('calcule aussi un employé pointeuse absent de la liste visible', async () => {
    const { service, prisma } = build([day('2026-06-22')]);

    await service.import([upload]);

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

  it('refuse un rapport entièrement hors de la période et n’écrit rien', async () => {
    const { service, prisma, files } = build([
      day('2026-05-20'),
      day('2026-06-19'),
    ]);

    await expect(service.import([upload])).rejects.toThrow(
      'rapport.xls : ce rapport couvre du 20/05/2026 au 19/06/2026, en dehors de la période du 20/06/2026 au 19/07/2026.',
    );
    expect(files.store).not.toHaveBeenCalled();
    expect(prisma.employee.create).not.toHaveBeenCalled();
    expect(prisma.timeClockReport.create).not.toHaveBeenCalled();
  });

  it('accepte un rapport qui chevauche partiellement la période', async () => {
    const { service, prisma } = build([day('2026-06-19'), day('2026-06-20')]);

    await service.import([upload]);

    expect(prisma.timeClockReport.create).toHaveBeenCalled();
  });
});
