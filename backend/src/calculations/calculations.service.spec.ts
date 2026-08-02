import { CalculationsService } from './calculations.service';

describe('CalculationsService history', () => {
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
                absenceDays: 1,
                stcDays: 0,
                paidLeaveDays: 2,
                sickLeaveDays: 0,
                overtimeMiniMinutes: 120,
                overtimeMaxiMinutes: 0,
                displacementDays: 1,
                requiresReview: false,
              },
              {
                normalMinutes: 9120,
                absenceDays: 2,
                stcDays: 1,
                paidLeaveDays: 0,
                sickLeaveDays: 3,
                overtimeMiniMinutes: 60,
                overtimeMaxiMinutes: 480,
                displacementDays: 2,
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
          absenceDays: 3,
          stcDays: 1,
          paidLeaveDays: 2,
          sickLeaveDays: 3,
          overtimeMiniMinutes: 180,
          overtimeMaxiMinutes: 480,
          displacementDays: 3,
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
