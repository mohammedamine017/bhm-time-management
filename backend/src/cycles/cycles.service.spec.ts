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

  it('reactivates an existing month without replacing its data', async () => {
    const current = {
      id: 'cycle-august',
      payrollMonth: '2026-08',
      status: 'ACTIVE',
    };
    const existing = {
      id: 'cycle-july',
      payrollMonth: '2026-07',
      status: 'COMPLETED',
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(existing);
    const update = jest
      .fn()
      .mockResolvedValueOnce({ ...current, status: 'COMPLETED' })
      .mockResolvedValueOnce({ ...existing, status: 'ACTIVE' });
    const prisma = {
      payrollCycle: { findFirst },
      $transaction: jest.fn().mockImplementation((callback) =>
        callback({
          payrollCycle: { update, create: jest.fn() },
        }),
      ),
    };
    const service = new CyclesService(prisma as never);

    const result = await service.getOrCreateActive('2026-07');

    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'cycle-august' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'cycle-july' },
      data: { status: 'ACTIVE', completedAt: null },
    });
    expect(result).toEqual(expect.objectContaining({ id: 'cycle-july' }));
  });

  it('recovers an older month containing documents instead of an empty duplicate', async () => {
    const emptyCurrent = {
      id: 'cycle-july-empty',
      payrollMonth: '2026-07',
      status: 'ACTIVE',
    };
    const existingWithDocuments = {
      id: 'cycle-july-with-documents',
      payrollMonth: '2026-07',
      status: 'COMPLETED',
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(emptyCurrent)
      .mockResolvedValueOnce(existingWithDocuments);
    const update = jest
      .fn()
      .mockResolvedValueOnce({ ...emptyCurrent, status: 'COMPLETED' })
      .mockResolvedValueOnce({
        ...existingWithDocuments,
        status: 'ACTIVE',
      });
    const prisma = {
      payrollCycle: { findFirst },
      $transaction: jest.fn().mockImplementation((callback) =>
        callback({
          payrollCycle: { update, create: jest.fn() },
        }),
      ),
    };
    const service = new CyclesService(prisma as never);

    const result = await service.getOrCreateActive('2026-07');

    expect(result).toEqual(
      expect.objectContaining({ id: 'cycle-july-with-documents' }),
    );
    expect(update).toHaveBeenCalledTimes(2);
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
