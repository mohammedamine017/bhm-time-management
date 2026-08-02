import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CycleStatus } from '@prisma/client';
import { ImportStatus } from '@prisma/client';

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateActive(month?: string) {
    const current = await this.prisma.payrollCycle.findFirst({
      where: { status: CycleStatus.ACTIVE },
    });

    if (!month && current) {
      return current;
    }

    const targetMonth = month ?? CyclesService.currentMonth();
    const bounds = CyclesService.bounds(targetMonth);
    if (current?.payrollMonth === targetMonth) return current;

    return this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.payrollCycle.update({
          where: { id: current.id },
          data: {
            status: CycleStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }

      return tx.payrollCycle.create({
        data: {
          payrollMonth: targetMonth,
          startDate: bounds.start,
          endDate: bounds.end,
        },
      });
    });
  }

  async reset(month?: string, resetEmployees = false) {
    const current = await this.getOrCreateActive(month);
    const now = new Date();

    const cycle = await this.prisma.$transaction(async (transaction) => {
      await transaction.payrollCycle.update({
        where: { id: current.id },
        data: {
          status: CycleStatus.RESET,
          resetAt: now,
          completedAt: now,
        },
      });
      if (resetEmployees) {
        await transaction.employeeListImport.updateMany({
          where: { status: ImportStatus.ACTIVE },
          data: { status: ImportStatus.ARCHIVED, archivedAt: now },
        });
      }
      return transaction.payrollCycle.create({
        data: {
          payrollMonth: current.payrollMonth,
          startDate: current.startDate,
          endDate: current.endDate,
        },
      });
    });

    return { cycle, resetEmployees };
  }

  static bounds(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    const year = Number(match?.[1]);
    const monthNumber = Number(match?.[2]);
    if (!match || monthNumber < 1 || monthNumber > 12) {
      throw new BadRequestException('Mois de paie invalide.');
    }

    return {
      start: new Date(Date.UTC(year, monthNumber - 2, 20)),
      end: new Date(Date.UTC(year, monthNumber - 1, 19)),
    };
  }

  static currentMonth(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
