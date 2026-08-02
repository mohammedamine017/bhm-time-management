import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalculationsService } from '../calculations/calculations.service';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly calculations: CalculationsService,
  ) {}

  async list(month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    return this.prisma.holiday.findMany({
      where: { date: { gte: cycle.startDate, lte: cycle.endDate } },
      orderBy: { date: 'asc' },
    });
  }

  async create(date: string, label: string, month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    const holidayDate = new Date(`${date}T00:00:00.000Z`);
    if (holidayDate < cycle.startDate || holidayDate > cycle.endDate) {
      throw new BadRequestException('La date doit appartenir au cycle actif.');
    }
    const holiday = await this.prisma.holiday.upsert({
      where: { date: holidayDate },
      create: { date: holidayDate, label: label.trim() },
      update: { label: label.trim() },
    });
    await this.calculations.recalculateIfExists(cycle.id);
    return holiday;
  }

  async remove(id: string, month?: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Jour férié introuvable.');
    await this.prisma.holiday.delete({ where: { id } });
    const cycle = await this.cycles.getOrCreateActive(month);
    await this.calculations.recalculateIfExists(cycle.id);
    return { deleted: true };
  }
}
