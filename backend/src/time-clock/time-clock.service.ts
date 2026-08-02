import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CalculationsService } from '../calculations/calculations.service';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScanStorageService } from '../scans/scan-storage.service';
import { TimeClockFileParserService } from './time-clock-file-parser.service';
import {
  ParsedTimeClockDay,
  RequiredTimeClockEmployee,
  TimeClockDayType,
  TimeClockDurationSource,
  UploadedTimeClockFile,
} from './time-clock.types';

@Injectable()
export class TimeClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly parser: TimeClockFileParserService,
    private readonly storage: ScanStorageService,
    private readonly calculations: CalculationsService,
  ) {}

  async required(month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    const rows = await this.prisma.extractedTimeSheetRow.findMany({
      where: {
        hasTimeClockCode: true,
        employeeId: { not: null },
        document: { batch: { cycleId: cycle.id } },
      },
      include: { employee: true },
    });
    const reports = await this.prisma.timeClockReport.findMany({
      where: { cycleId: cycle.id },
      orderBy: { importedAt: 'desc' },
    });
    const reportByEmployee = new Map(
      reports.map((report) => [report.employeeId, report]),
    );
    const requiredByEmployee = new Map<
      string,
      { employee: NonNullable<(typeof rows)[number]['employee']>; dates: Set<string> }
    >();

    for (const row of rows) {
      if (!row.employee) continue;
      const current = requiredByEmployee.get(row.employee.id) ?? {
        employee: row.employee,
        dates: new Set<string>(),
      };
      for (const day of this.days(row.days)) {
        if (day.value.trim().toUpperCase() === 'T') current.dates.add(day.date);
      }
      requiredByEmployee.set(row.employee.id, current);
    }

    const employees: RequiredTimeClockEmployee[] = [...requiredByEmployee.values()]
      .map(({ employee, dates }) => {
        const report = reportByEmployee.get(employee.id);
        return {
          employee: {
            id: employee.id,
            matricule: employee.matricule,
            firstName: employee.firstName,
            lastName: employee.lastName,
          },
          requiredDates: [...dates].sort(),
          report: report
            ? {
                id: report.id,
                fileName: report.fileName,
                storageUrl: report.storageUrl,
                importedAt: report.importedAt,
                days: this.reportDays(report.days),
              }
            : null,
        };
      })
      .sort((a, b) =>
        `${a.employee.lastName} ${a.employee.firstName}`.localeCompare(
          `${b.employee.lastName} ${b.employee.firstName}`,
          'fr',
        ),
      );

    const readyCount = employees.filter((item) => item.report).length;
    return {
      cycleId: cycle.id,
      requiredCount: employees.length,
      readyCount,
      missingCount: employees.length - readyCount,
      isReady: employees.length === readyCount,
      employees: employees.map((item) => ({
        ...item,
        unresolvedDates: item.report
          ? item.requiredDates.filter(
              (date) =>
                !item.report?.days.some(
                  (day) => day.date === date && day.workedMinutes !== null,
                ),
            )
          : item.requiredDates,
      })),
    };
  }

  async import(
    employeeId: string,
    file: UploadedTimeClockFile,
    month?: string,
  ) {
    if (!file) throw new BadRequestException('Aucun rapport selectionne.');
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!['xls', 'xlsx'].includes(extension ?? '')) {
      throw new BadRequestException('Formats acceptes: XLS et XLSX.');
    }

    const requirements = await this.required(month);
    const requiredEmployee = requirements.employees.find(
      (item) => item.employee.id === employeeId,
    );
    if (!requiredEmployee) {
      throw new BadRequestException(
        "Cet employe n'a aucune case T pour le cycle actif.",
      );
    }

    const cycle = await this.cycles.getOrCreateActive(month);
    const parsedDays = await this.parser.parse(file);
    const days = this.mergeDays(parsedDays).filter(
      (day) =>
        day.date >= this.isoDate(cycle.startDate) &&
        day.date <= this.isoDate(cycle.endDate),
    );
    if (!days.length) {
      throw new BadRequestException(
        'Le rapport ne contient aucune date dans la periode active.',
      );
    }

    const stored = await this.storage.store(file, 'time-clock-reports');
    await this.prisma.timeClockReport.upsert({
      where: {
        cycleId_employeeId: { cycleId: cycle.id, employeeId },
      },
      create: {
        cycleId: cycle.id,
        employeeId,
        fileName: file.originalname,
        days: days as unknown as Prisma.InputJsonValue,
        ...stored,
      },
      update: {
        fileName: file.originalname,
        days: days as unknown as Prisma.InputJsonValue,
        importedAt: new Date(),
        ...stored,
      },
    });
    await this.calculations.recalculateIfExists(cycle.id);

    return this.required(cycle.payrollMonth);
  }

  async updateDay(reportId: string, date: string, value: string) {
    const report = await this.prisma.timeClockReport.findUnique({
      where: { id: reportId },
      include: { cycle: true },
    });
    if (!report) {
      throw new NotFoundException('Rapport pointeuse introuvable.');
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < this.isoDate(report.cycle.startDate) ||
      date > this.isoDate(report.cycle.endDate)
    ) {
      throw new BadRequestException('Date hors de la periode active.');
    }

    const workedMinutes = this.parseManualDuration(value);
    const days = this.reportDays(report.days);
    const existingIndex = days.findIndex((day) => day.date === date);
    const updatedDay: ParsedTimeClockDay = {
      date,
      sourceState:
        existingIndex >= 0 ? days[existingIndex].sourceState : null,
      dayType:
        existingIndex >= 0 && days[existingIndex].dayType !== 'UNKNOWN'
          ? days[existingIndex].dayType
          : this.calendarDayType(date, workedMinutes),
      punches: existingIndex >= 0 ? days[existingIndex].punches : [],
      workedMinutes,
      durationSource: workedMinutes === null ? 'MISSING' : 'MANUAL',
      needsReview: workedMinutes === null,
      warnings: workedMinutes === null ? ['DURÉE_MANQUANTE'] : [],
    };
    if (existingIndex >= 0) {
      days[existingIndex] = updatedDay;
    } else {
      days.push(updatedDay);
      days.sort((a, b) => a.date.localeCompare(b.date));
    }

    await this.prisma.timeClockReport.update({
      where: { id: reportId },
      data: { days: days as unknown as Prisma.InputJsonValue },
    });
    await this.calculations.recalculateIfExists(report.cycleId);
    return this.required(report.cycle.payrollMonth);
  }

  private mergeDays(days: ParsedTimeClockDay[]) {
    const byDate = new Map<string, ParsedTimeClockDay>();
    for (const day of days) {
      const existing = byDate.get(day.date);
      if (!existing) {
        byDate.set(day.date, day);
        continue;
      }
      const punches = [...new Set([...existing.punches, ...day.punches])].sort();
      byDate.set(day.date, {
        date: day.date,
        sourceState: day.sourceState ?? existing.sourceState,
        dayType: this.strongerDayType(existing.dayType, day.dayType),
        punches,
        workedMinutes:
          existing.workedMinutes !== null && day.workedMinutes !== null
            ? existing.workedMinutes + day.workedMinutes
            : existing.workedMinutes ?? day.workedMinutes,
        durationSource:
          existing.durationSource === 'MANUAL' ||
          day.durationSource === 'MANUAL'
            ? 'MANUAL'
            : existing.durationSource === 'CALCULATED' ||
                day.durationSource === 'CALCULATED'
              ? 'CALCULATED'
              : day.durationSource,
        needsReview: existing.needsReview || day.needsReview,
        warnings: [...new Set([...existing.warnings, ...day.warnings])],
      });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private days(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value as { date: string; value: string }[];
  }

  private reportDays(value: unknown) {
    if (!Array.isArray(value)) return [];
    return (value as Record<string, unknown>[]).map((day) => {
      const date = String(day['date'] ?? '');
      const punches = Array.isArray(day['punches'])
        ? day['punches'].map(String)
        : [];
      const sourceState =
        String(day['sourceState'] ?? day['state'] ?? '').trim() || null;
      const dayType =
        (day['dayType'] as TimeClockDayType | undefined) ??
        this.inferStoredDayType(date, sourceState, punches);
      const storedMinutes =
        typeof day['workedMinutes'] === 'number'
          ? day['workedMinutes']
          : null;
      const durationSource =
        (day['durationSource'] as TimeClockDurationSource | undefined) ??
        this.inferDurationSource(dayType, punches, storedMinutes);
      const warnings = Array.isArray(day['warnings'])
        ? day['warnings'].map(String)
        : [];
      return {
        date,
        sourceState,
        dayType,
        punches,
        workedMinutes:
          storedMinutes ??
          (dayType === 'ABSENT' ||
          dayType === 'WEEKEND' ||
          dayType === 'HOLIDAY'
            ? 0
            : null),
        durationSource,
        needsReview:
          dayType === 'UNKNOWN' ||
          (Boolean(day['needsReview']) && warnings.length > 0),
        warnings,
      };
    });
  }

  private isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private parseManualDuration(value: string) {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;

    const time = /^(\d{1,2}):(\d{2})$/.exec(normalized);
    if (time) {
      const hours = Number(time[1]);
      const minutes = Number(time[2]);
      if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) {
        throw new BadRequestException('Durée invalide. Format attendu: HH:MM.');
      }
      return hours * 60 + minutes;
    }

    const hours = Number(normalized);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new BadRequestException(
        'Durée invalide. Utiliser HH:MM ou un nombre d’heures.',
      );
    }
    return Math.round(hours * 60);
  }

  private inferStoredDayType(
    date: string,
    sourceState: string | null,
    punches: string[],
  ): TimeClockDayType {
    const state = (sourceState ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (state.includes('absent')) return 'ABSENT';
    if (state.includes('ferie')) return 'HOLIDAY';
    if (/week\s*end|weekend|repos/.test(state)) return 'WEEKEND';
    return this.calendarDayType(date, punches.length >= 2 ? 1 : null);
  }

  private calendarDayType(
    date: string,
    workedMinutes: number | null,
  ): TimeClockDayType {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (weekday === 5 || weekday === 6) return 'WEEKEND';
    return workedMinutes === null ? 'UNKNOWN' : 'WORKED';
  }

  private strongerDayType(
    first: TimeClockDayType,
    second: TimeClockDayType,
  ) {
    const priority: TimeClockDayType[] = [
      'UNKNOWN',
      'WORKED',
      'ABSENT',
      'WEEKEND',
      'HOLIDAY',
    ];
    return priority.indexOf(first) >= priority.indexOf(second)
      ? first
      : second;
  }

  private inferDurationSource(
    dayType: TimeClockDayType,
    punches: string[],
    workedMinutes: number | null,
  ): TimeClockDurationSource {
    if (workedMinutes === null) {
      return dayType !== 'UNKNOWN' && punches.length === 0
        ? 'STATE'
        : 'MISSING';
    }
    if (punches.length >= 2) return 'CALCULATED';
    if (punches.length === 1 && workedMinutes > 0) return 'MANUAL';
    return dayType === 'UNKNOWN' ? 'MANUAL' : 'STATE';
  }
}
