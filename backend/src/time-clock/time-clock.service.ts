import { BadRequestException, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { normalizePersonName } from '../common/person-name';
import { CyclesService } from '../cycles/cycles.service';
import { CalculationsService } from '../calculations/calculations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeClockFilesService } from './time-clock-files.service';
import { TimeClockParserService } from './time-clock-parser.service';
import type { UploadedTimeClockFile } from './time-clock.types';

@Injectable()
export class TimeClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly parser: TimeClockParserService,
    private readonly files: TimeClockFilesService,
    private readonly calculations: CalculationsService,
  ) {}

  async list(month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    return this.prisma.timeClockReport.findMany({
      where: { cycleId: cycle.id },
      include: {
        employees: {
          include: { employee: true },
          orderBy: { sourceFullName: 'asc' },
        },
      },
      orderBy: { importedAt: 'desc' },
    });
  }

  async import(files: UploadedTimeClockFile[], month?: string) {
    if (!files?.length) {
      throw new BadRequestException('Sélectionnez au moins un rapport Excel.');
    }
    const cycle = await this.cycles.getOrCreateActive(month);
    const employees = await this.prisma.employee.findMany({
      where: { listImport: { status: ImportStatus.ACTIVE } },
    });
    if (!employees.length) {
      throw new BadRequestException(
        'Importez d’abord la liste active des employés.',
      );
    }
    const employeeByName = new Map<string, (typeof employees)[number]>();
    for (const employee of employees) {
      employeeByName.set(employee.normalizedFullName, employee);
      employeeByName.set(
        normalizePersonName(`${employee.lastName} ${employee.firstName}`),
        employee,
      );
    }

    for (const file of files) {
      if (!/\.xlsx?$/i.test(file.originalname)) {
        throw new BadRequestException(
          `${file.originalname}: seuls les fichiers .xls et .xlsx sont acceptés.`,
        );
      }
      const checksum = createHash('sha256').update(file.buffer).digest('hex');
      const duplicate = await this.prisma.timeClockReport.findUnique({
        where: { cycleId_checksum: { cycleId: cycle.id, checksum } },
      });
      if (duplicate) continue;

      const parsed = this.parser.parse(file.buffer);
      const stored = await this.files.store(file);
      await this.prisma.timeClockReport.create({
        data: {
          cycleId: cycle.id,
          fileName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          checksum,
          ...stored,
          employees: {
            create: parsed.map((entry) => {
              const employee = employeeByName.get(
                normalizePersonName(entry.sourceFullName),
              );
              return {
                employeeId: employee?.id,
                sourceEmployeeNumber: entry.sourceEmployeeNumber,
                sourceFullName: entry.sourceFullName,
                days: entry.days as unknown as Prisma.InputJsonValue,
                requiresReview: entry.requiresReview || !employee,
              };
            }),
          },
        },
      });
    }
    return this.list(cycle.payrollMonth);
  }

  async updateDay(entryId: string, date: string, durationMinutes: number) {
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
      throw new BadRequestException('La durée doit être un nombre de minutes positif.');
    }
    const entry = await this.prisma.timeClockReportEmployee.findUnique({
      where: { id: entryId },
      include: { report: true },
    });
    if (!entry) throw new BadRequestException('Ligne de pointage introuvable.');
    const days = Array.isArray(entry.days)
      ? (entry.days as unknown as Array<Record<string, unknown>>)
      : [];
    const updatedDays = days.map((day) =>
      day.date === date
        ? {
            ...day,
            durationMinutes,
            state: durationMinutes > 0 ? 'WORKED' : day.state,
            needsReview: false,
          }
        : day,
    );
    const requiresReview = updatedDays.some((day) => day.needsReview === true);
    const updated = await this.prisma.timeClockReportEmployee.update({
      where: { id: entryId },
      data: {
        days: updatedDays as Prisma.InputJsonValue,
        requiresReview: requiresReview || !entry.employeeId,
      },
      include: { employee: true },
    });
    await this.calculations.recalculateIfExists(entry.report.cycleId);
    return updated;
  }
}
