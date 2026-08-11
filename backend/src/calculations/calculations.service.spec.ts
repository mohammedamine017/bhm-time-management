import { CalculationsService } from './calculations.service';

describe('CalculationsService', () => {
  it('autorise le calcul avec la liste des employés et les feuilles uniquement', async () => {
    const prisma = {
      employee: { count: jest.fn().mockResolvedValue(6) },
      extractedTimeSheetRow: { count: jest.fn().mockResolvedValue(2) },
      timeClockReport: { count: jest.fn().mockResolvedValue(3) },
      calculationRun: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const cycles = {
      getOrCreateActive: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        payrollMonth: '2026-07',
      }),
    };
    const service = new CalculationsService(
      prisma as never,
      cycles as never,
      {} as never,
    );

    await expect(service.status()).resolves.toMatchObject({
      canLaunch: true,
      prerequisites: {
        employeesReady: true,
        scansReady: true,
        employeeCount: 6,
        scannedRowCount: 2,
        timeClockReportCount: 3,
      },
    });
  });

  it('ajoute la pause du rapport à chaque journée pointée', async () => {
    const employee = { id: 'employee-1', firstName: 'Anes', lastName: 'B' };
    const entry = {
      employeeId: 'employee-1',
      reportId: 'report-1',
      requiresReview: false,
      days: [
        {
          date: '2026-06-22',
          punches: ['08:00:00', '16:00:00'],
          durationMinutes: 480,
          state: 'WORKED',
          stateLabel: '',
          needsReview: false,
        },
        {
          date: '2026-06-23',
          punches: [],
          durationMinutes: 0,
          state: 'ABSENT',
          stateLabel: 'Absent(e)',
          needsReview: false,
        },
      ],
      report: {
        fileName: 'pointage.xls',
        storageUrl: null,
        pauseMinutes: 60,
      },
    };
    const calculate = jest.fn().mockReturnValue({ employeeId: 'employee-1' });
    const prisma = {
      payrollCycle: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          startDate: new Date('2026-06-20T00:00:00.000Z'),
          endDate: new Date('2026-07-19T00:00:00.000Z'),
        }),
      },
      employee: { findMany: jest.fn().mockResolvedValue([employee]) },
      extractedTimeSheetRow: { findMany: jest.fn().mockResolvedValue([]) },
      timeClockReportEmployee: { findMany: jest.fn().mockResolvedValue([entry]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      calculationRun: { findUnique: jest.fn().mockResolvedValue({ id: 'run-1' }) },
      $transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          calculationRun: { upsert: jest.fn().mockResolvedValue({ id: 'run-1' }) },
          employeeCalculation: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        }),
      ),
    };
    const service = new CalculationsService(
      prisma as never,
      {} as never,
      { calculate } as never,
    );

    await service.recalculateIfExists('cycle-1');

    const administrationDays = calculate.mock.calls[0][0].administrationDays;
    expect(administrationDays[0].durationMinutes).toBe(540);
    expect(administrationDays[1].durationMinutes).toBe(0);
  });

  it('returns archived runs with aggregated totals and review count', async () => {
    const launchedAt = new Date('2026-07-20T08:00:00.000Z');
    const resetAt = new Date('2026-07-21T08:00:00.000Z');
    const prisma = {
      calculationRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-1',
            openDays: 21,
            adjustmentMinutes: 480,
            launchedAt,
            cycle: {
              payrollMonth: '2026-07',
              startDate: new Date('2026-06-20T00:00:00.000Z'),
              endDate: new Date('2026-07-19T00:00:00.000Z'),
              resetAt,
              completedAt: resetAt,
            },
            results: [
              {
                normalMinutes: 9600,
                absenceMinutes: 480,
                stcDays: 0,
                paidLeaveDays: 2,
                sickLeaveDays: 0,
                overtimeMiniMinutes: 120,
                overtimeMaxiMinutes: 0,
                displacementDays: 1,
                taskDays: 1,
                requiresReview: false,
              },
              {
                normalMinutes: 9120,
                absenceMinutes: 960,
                stcDays: 1,
                paidLeaveDays: 0,
                sickLeaveDays: 3,
                overtimeMiniMinutes: 60,
                overtimeMaxiMinutes: 480,
                displacementDays: 2,
                taskDays: 2,
                requiresReview: true,
              },
            ],
          },
        ]),
      },
    };
    const service = new CalculationsService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const history = await service.history();

    expect(history).toEqual([
      expect.objectContaining({
        id: 'run-1',
        employeeCount: 2,
        reviewCount: 1,
        archivedAt: resetAt,
        totals: {
          normalMinutes: 18720,
          absenceMinutes: 1440,
          stcDays: 1,
          paidLeaveDays: 2,
          sickLeaveDays: 3,
          overtimeMiniMinutes: 180,
          overtimeMaxiMinutes: 480,
          displacementDays: 3,
          taskDays: 3,
        },
      }),
    ]);
    expect(prisma.calculationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { launchedAt: 'desc' },
      }),
    );
  });
});
