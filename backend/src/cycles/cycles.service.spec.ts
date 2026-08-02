import { BadRequestException } from '@nestjs/common';
import { CyclesService } from './cycles.service';

describe('CyclesService', () => {
  it('builds the payroll range from the previous month 20 to current month 19', () => {
    const bounds = CyclesService.bounds('2026-07');

    expect(bounds.start.toISOString()).toBe('2026-06-20T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-07-19T00:00:00.000Z');
  });

  it('supports the January year boundary', () => {
    const bounds = CyclesService.bounds('2027-01');

    expect(bounds.start.toISOString()).toBe('2026-12-20T00:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2027-01-19T00:00:00.000Z');
  });

  it('rejects an invalid payroll month', () => {
    expect(() => CyclesService.bounds('2026-13')).toThrow(BadRequestException);
  });

  it('resets the cycle and archives employees only when requested', async () => {
    const current = {
      id: 'cycle-1',
      payrollMonth: '2026-07',
      startDate: new Date('2026-06-20T00:00:00.000Z'),
      endDate: new Date('2026-07-19T00:00:00.000Z'),
    };
    const updateCycle = jest.fn().mockResolvedValue({});
    const archiveLists = jest.fn().mockResolvedValue({ count: 1 });
    const createCycle = jest.fn().mockResolvedValue({
      ...current,
      id: 'cycle-2',
    });
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) =>
        callback({
          payrollCycle: { update: updateCycle, create: createCycle },
          employeeListImport: { updateMany: archiveLists },
        }),
      ),
    };
    const service = new CyclesService(prisma as never);
    jest.spyOn(service, 'getOrCreateActive').mockResolvedValue(current as never);

    const result = await service.reset('2026-07', true);

    expect(updateCycle).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      data: expect.objectContaining({ status: 'RESET' }),
    });
    expect(archiveLists).toHaveBeenCalledTimes(1);
    expect(createCycle).toHaveBeenCalledWith({
      data: {
        payrollMonth: '2026-07',
        startDate: current.startDate,
        endDate: current.endDate,
      },
    });
    expect(result).toEqual({
      cycle: expect.objectContaining({ id: 'cycle-2' }),
      resetEmployees: true,
    });
  });
});
