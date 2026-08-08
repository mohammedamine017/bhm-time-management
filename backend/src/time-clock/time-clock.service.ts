import { BadRequestException, Injectable } from '@nestjs/common';
import { ImportStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { normalizePersonName } from '../common/person-name';
import { CyclesService } from '../cycles/cycles.service';
import { CalculationsService } from '../calculations/calculations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeClockFilesService } from './time-clock-files.service';
import { TimeClockParserService } from './time-clock-parser.service';
import type {
  ParsedTimeClockEmployee,
  UploadedTimeClockFile,
} from './time-clock.types';

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
    const activeImport = await this.prisma.employeeListImport.findFirst({
      where: { status: ImportStatus.ACTIVE },
      orderBy: { importedAt: 'desc' },
    });
    if (!activeImport) {
      throw new BadRequestException(
        'Importez d’abord la liste active des employés.',
      );
    }
    const employees = await this.prisma.employee.findMany({
      where: { listImportId: activeImport.id },
    });
    const employeeByName = new Map<string, (typeof employees)[number]>();
    for (const employee of employees) {
      employeeByName.set(employee.normalizedFullName, employee);
      employeeByName.set(
        normalizePersonName(`${employee.lastName} ${employee.firstName}`),
        employee,
      );
    }

    // Premier passage: tout valider avant d’écrire, pour ne jamais laisser un
    // import partiel ni un employé pointeuse créé pour un rapport refusé.
    const periodStart = TimeClockService.isoDate(cycle.startDate);
    const periodEnd = TimeClockService.isoDate(cycle.endDate);
    const accepted: {
      file: UploadedTimeClockFile;
      checksum: string;
      parsed: ParsedTimeClockEmployee[];
    }[] = [];
    const seenChecksums = new Set<string>();

    for (const file of files) {
      if (!/\.xlsx?$/i.test(file.originalname)) {
        throw new BadRequestException(
          `${file.originalname}: seuls les fichiers .xls et .xlsx sont acceptés.`,
        );
      }
      const checksum = createHash('sha256').update(file.buffer).digest('hex');
      if (seenChecksums.has(checksum)) continue;
      const duplicate = await this.prisma.timeClockReport.findUnique({
        where: { cycleId_checksum: { cycleId: cycle.id, checksum } },
      });
      if (duplicate) continue;

      const parsed = this.parser.parse(file.buffer);
      this.requirePeriodOverlap(
        file.originalname,
        parsed,
        periodStart,
        periodEnd,
      );
      seenChecksums.add(checksum);
      accepted.push({ file, checksum, parsed });
    }

    for (const { file, checksum, parsed } of accepted) {
      const stored = await this.files.store(file);
      const resolvedEntries = [];
      for (const entry of parsed) {
        const normalizedName = normalizePersonName(entry.sourceFullName);
        let employee = employeeByName.get(normalizedName);
        if (!employee) {
          employee = await this.prisma.employee.create({
            data: {
              matricule: `PNT-${createHash('sha1')
                .update(normalizedName)
                .digest('hex')
                .slice(0, 10)
                .toUpperCase()}`,
              firstName: entry.sourceFullName.trim(),
              lastName: '',
              normalizedFullName: normalizedName,
              isExternal: true,
              listImportId: activeImport.id,
            },
          });
          employeeByName.set(normalizedName, employee);
        }
        resolvedEntries.push({ entry, employee });
      }
      await this.prisma.timeClockReport.create({
        data: {
          cycleId: cycle.id,
          fileName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          checksum,
          ...stored,
          employees: {
            create: resolvedEntries.map(({ entry, employee }) => {
              return {
                employeeId: employee.id,
                sourceEmployeeNumber: entry.sourceEmployeeNumber,
                sourceFullName: entry.sourceFullName,
                days: entry.days as unknown as Prisma.InputJsonValue,
                requiresReview: entry.requiresReview,
              };
            }),
          },
        },
      });
    }
    return this.list(cycle.payrollMonth);
  }

  private requirePeriodOverlap(
    fileName: string,
    parsed: ParsedTimeClockEmployee[],
    periodStart: string,
    periodEnd: string,
  ) {
    const dates = parsed
      .flatMap((employee) => employee.days.map((day) => day.date))
      .sort();
    if (!dates.length) {
      throw new BadRequestException(
        `${fileName} : aucune date lisible dans ce rapport.`,
      );
    }
    const covered = dates.some(
      (date) => date >= periodStart && date <= periodEnd,
    );
    if (covered) return;

    throw new BadRequestException(
      `${fileName} : ce rapport couvre du ${TimeClockService.frenchDate(dates[0])} au ${TimeClockService.frenchDate(dates[dates.length - 1])}, en dehors de la période du ${TimeClockService.frenchDate(periodStart)} au ${TimeClockService.frenchDate(periodEnd)}.`,
    );
  }

  private static isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private static frenchDate(isoDate: string) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
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
        requiresReview,
      },
      include: { employee: true },
    });
    await this.calculations.recalculateIfExists(entry.report.cycleId);
    return updated;
  }
}
