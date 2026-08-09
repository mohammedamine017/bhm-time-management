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

  it('returns the live cycle of the month without touching another month', async () => {
    const july = { id: 'cycle-july', payrollMonth: '2026-07', status: 'ACTIVE' };
    const findFirst = jest.fn().mockResolvedValue(july);
    const create = jest.fn();
    const prisma = { payrollCycle: { findFirst, create } };
    const service = new CyclesService(prisma as never);

    const result = await service.getOrCreateActive('2026-07');

    expect(result).toEqual(july);
    expect(findFirst).toHaveBeenCalledWith({
      where: { payrollMonth: '2026-07', status: { not: 'RESET' } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the cycle of the month when none is live', async () => {
    const created = { id: 'cycle-july', payrollMonth: '2026-07' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = {
      payrollCycle: { findFirst: jest.fn().mockResolvedValue(null), create },
    };
    const service = new CyclesService(prisma as never);

    const result = await service.getOrCreateActive('2026-07');

    expect(result).toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: {
        payrollMonth: '2026-07',
        startDate: new Date('2026-06-20T00:00:00.000Z'),
        endDate: new Date('2026-07-19T00:00:00.000Z'),
      },
    });
  });

  it('recovers the cycle created by a parallel call', async () => {
    const winner = { id: 'cycle-july', payrollMonth: '2026-07' };
    const prisma = {
      payrollCycle: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('unique constraint')),
        findFirstOrThrow: jest.fn().mockResolvedValue(winner),
      },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.getOrCreateActive('2026-07')).resolves.toEqual(winner);
  });

  it('ignores a reset cycle and opens a fresh one for the same month', async () => {
    const created = { id: 'cycle-july-2', payrollMonth: '2026-07' };
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      payrollCycle: { findFirst, create: jest.fn().mockResolvedValue(created) },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.getOrCreateActive('2026-07')).resolves.toEqual(created);
    expect(findFirst).toHaveBeenCalledWith({
      where: { payrollMonth: '2026-07', status: { not: 'RESET' } },
    });
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
