import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CycleStatus, ImportStatus, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { CyclesService } from '../cycles/cycles.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ParsedTimeClockDay,
  TimeClockDayType,
  TimeClockDurationSource,
} from '../time-clock/time-clock.types';
import { CalculationEngineService } from './calculation-engine.service';
import type { ScannedCalculationDay } from './calculation.types';

type CalculationWithEmployee = Prisma.EmployeeCalculationGetPayload<{
  include: { employee: true };
}>;

@Injectable()
export class CalculationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly engine: CalculationEngineService,
  ) {}

  async status(month?: string) {
    const cycle = await this.cycles.getOrCreateActive(month);
    const [employeeCount, scannedRows, requiredRows, reports, run] =
      await Promise.all([
        this.prisma.employee.count({
          where: { listImport: { status: ImportStatus.ACTIVE } },
        }),
        this.prisma.extractedTimeSheetRow.count({
          where: { document: { batch: { cycleId: cycle.id } } },
        }),
        this.prisma.extractedTimeSheetRow.findMany({
          where: {
            document: { batch: { cycleId: cycle.id } },
            employeeId: { not: null },
            hasTimeClockCode: true,
          },
          select: { employeeId: true },
        }),
        this.prisma.timeClockReport.findMany({
          where: { cycleId: cycle.id },
          select: { employeeId: true },
        }),
        this.prisma.calculationRun.findUnique({
          where: { cycleId: cycle.id },
          include: {
            results: {
              include: { employee: true },
              orderBy: { employee: { lastName: 'asc' } },
            },
          },
        }),
      ]);

    const requiredEmployeeIds = new Set(
      requiredRows.map((row) => row.employeeId).filter(Boolean),
    );
    const reportEmployeeIds = new Set(reports.map((report) => report.employeeId));
    const missingReportCount = [...requiredEmployeeIds].filter(
      (employeeId) => !reportEmployeeIds.has(employeeId as string),
    ).length;
    const prerequisites = {
      employeesReady: employeeCount > 0,
      scansReady: scannedRows > 0,
      reportsReady: missingReportCount === 0,
      employeeCount,
      scannedRowCount: scannedRows,
      requiredReportCount: requiredEmployeeIds.size,
      missingReportCount,
    };

    return {
      cycle,
      prerequisites,
      canLaunch:
        prerequisites.employeesReady &&
        prerequisites.scansReady &&
        prerequisites.reportsReady,
      run,
    };
  }

  async launch(month?: string) {
    const currentStatus = await this.status(month);
    if (!currentStatus.canLaunch) {
      throw new BadRequestException(
        'La liste des employés, les feuilles et tous les rapports requis sont nécessaires.',
      );
    }
    await this.calculateCycle(currentStatus.cycle.id);
    return this.status(currentStatus.cycle.payrollMonth);
  }

  async recalculateIfExists(cycleId: string) {
    const run = await this.prisma.calculationRun.findUnique({
      where: { cycleId },
      select: { id: true },
    });
    if (run) await this.calculateCycle(cycleId);
  }

  async history() {
    const runs = await this.prisma.calculationRun.findMany({
      where: {
        cycle: {
          status: { in: [CycleStatus.COMPLETED, CycleStatus.RESET] },
        },
      },
      include: {
        cycle: true,
        results: {
          select: {
            normalMinutes: true,
            absenceDays: true,
            stcDays: true,
            paidLeaveDays: true,
            sickLeaveDays: true,
            overtimeMiniMinutes: true,
            overtimeMaxiMinutes: true,
            displacementDays: true,
            requiresReview: true,
          },
        },
      },
      orderBy: { launchedAt: 'desc' },
    });

    return runs.map((run) => ({
      id: run.id,
      cycle: run.cycle,
      openDays: run.openDays,
      adjustmentMinutes: run.adjustmentMinutes,
      launchedAt: run.launchedAt,
      archivedAt: run.cycle.resetAt ?? run.cycle.completedAt,
      employeeCount: run.results.length,
      reviewCount: run.results.filter((result) => result.requiresReview).length,
      totals: run.results.reduce(
        (totals, result) => ({
          normalMinutes: totals.normalMinutes + result.normalMinutes,
          absenceDays: totals.absenceDays + result.absenceDays,
          stcDays: totals.stcDays + result.stcDays,
          paidLeaveDays: totals.paidLeaveDays + result.paidLeaveDays,
          sickLeaveDays: totals.sickLeaveDays + result.sickLeaveDays,
          overtimeMiniMinutes:
            totals.overtimeMiniMinutes + result.overtimeMiniMinutes,
          overtimeMaxiMinutes:
            totals.overtimeMaxiMinutes + result.overtimeMaxiMinutes,
          displacementDays:
            totals.displacementDays + result.displacementDays,
        }),
        {
          normalMinutes: 0,
          absenceDays: 0,
          stcDays: 0,
          paidLeaveDays: 0,
          sickLeaveDays: 0,
          overtimeMiniMinutes: 0,
          overtimeMaxiMinutes: 0,
          displacementDays: 0,
        },
      ),
    }));
  }

  async historyRun(runId: string) {
    return this.findArchivedRun(runId);
  }

  async exportWorkbook(month?: string, employeeId?: string) {
    const currentStatus = await this.status(month);
    if (!currentStatus.run) {
      throw new BadRequestException(
        'L’opération doit être calculée avant l’export.',
      );
    }

    return this.buildWorkbook(
      currentStatus.cycle.payrollMonth,
      currentStatus.run.results,
      employeeId,
    );
  }

  async exportHistoryWorkbook(runId: string, employeeId?: string) {
    const run = await this.findArchivedRun(runId);
    return this.buildWorkbook(run.cycle.payrollMonth, run.results, employeeId);
  }

  private async buildWorkbook(
    payrollMonth: string,
    allResults: CalculationWithEmployee[],
    employeeId?: string,
  ) {
    const results = employeeId
      ? allResults.filter((result) => result.employeeId === employeeId)
      : allResults;
    if (!results.length) {
      throw new BadRequestException('Aucun résultat à exporter.');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BHM Time Management';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Rubriques');
    summary.columns = [
      { header: 'Matricule', key: 'matricule', width: 16 },
      { header: 'Prénom', key: 'firstName', width: 22 },
      { header: 'Nom', key: 'lastName', width: 22 },
      { header: 'Heures normales', key: 'normal', width: 18 },
      { header: 'Absences (jours)', key: 'absence', width: 18 },
      { header: 'Congés payés CP (jours)', key: 'paidLeave', width: 22 },
      { header: 'Maladie MA (jours)', key: 'sickLeave', width: 20 },
      { header: 'Fin de contrat STC (jours)', key: 'stc', width: 24 },
      { header: 'Supp. mini', key: 'mini', width: 15 },
      { header: 'Supp. maxi', key: 'maxi', width: 15 },
      { header: 'Déplacements', key: 'displacement', width: 15 },
      { header: 'État', key: 'state', width: 15 },
    ];
    for (const result of results) {
      summary.addRow({
        matricule: result.employee.matricule,
        firstName: result.employee.firstName,
        lastName: result.employee.lastName,
        normal: this.decimalHours(result.normalMinutes),
        absence: result.absenceDays,
        paidLeave: result.paidLeaveDays,
        sickLeave: result.sickLeaveDays,
        stc: result.stcDays,
        mini: this.decimalHours(result.overtimeMiniMinutes),
        maxi: this.decimalHours(result.overtimeMaxiMinutes),
        displacement: result.displacementDays,
        state: result.requiresReview ? 'À vérifier' : 'Correct',
      });
    }

    const detail = workbook.addWorksheet('Détail journalier');
    detail.columns = [
      { header: 'Matricule', key: 'matricule', width: 16 },
      { header: 'Employé', key: 'employee', width: 30 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Valeur feuille', key: 'values', width: 18 },
      { header: 'Type de journée', key: 'dayType', width: 18 },
      { header: 'Durée travaillée', key: 'worked', width: 18 },
      { header: 'Absence', key: 'absence', width: 12 },
      { header: 'CP', key: 'paidLeave', width: 10 },
      { header: 'MA', key: 'sickLeave', width: 10 },
      { header: 'STC', key: 'stc', width: 10 },
      { header: 'À vérifier', key: 'review', width: 14 },
    ];
    for (const result of results) {
      for (const day of this.calculationDetails(result.details)) {
        detail.addRow({
          matricule: result.employee.matricule,
          employee: `${result.employee.firstName} ${result.employee.lastName}`,
          date: day.date,
          values: day.values.join(' + '),
          dayType: this.exportDayType(day.dayType),
          worked: this.decimalHours(day.workedMinutes),
          absence: day.absenceDay ? 'Oui' : '',
          paidLeave: day.paidLeaveDay ? 'Oui' : '',
          sickLeave: day.sickLeaveDay ? 'Oui' : '',
          stc: day.stcDay ? 'Oui' : '',
          review: day.requiresReview ? 'Oui' : 'Non',
        });
      }
    }

    for (const worksheet of [summary, detail]) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount },
      };
      const header = worksheet.getRow(1);
      header.height = 24;
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1456A0' },
      };
      header.alignment = { vertical: 'middle' };
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF4F8FC' },
          };
        }
      });
    }
    summary.getColumn('normal').numFmt = '0.00';
    summary.getColumn('mini').numFmt = '0.00';
    summary.getColumn('maxi').numFmt = '0.00';
    detail.getColumn('worked').numFmt = '0.00';

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const suffix = employeeId
      ? `_${results[0].employee.matricule}`
      : '_global';
    return {
      buffer,
      fileName: `BHM_heures_${payrollMonth}${suffix}.xlsx`,
    };
  }

  private async findArchivedRun(runId: string) {
    const run = await this.prisma.calculationRun.findFirst({
      where: {
        id: runId,
        cycle: {
          status: { in: [CycleStatus.COMPLETED, CycleStatus.RESET] },
        },
      },
      include: {
        cycle: true,
        results: {
          include: { employee: true },
          orderBy: { employee: { lastName: 'asc' } },
        },
      },
    });
    if (!run) {
      throw new NotFoundException('Calcul archivé introuvable.');
    }
    return run;
  }

  private async calculateCycle(cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findUniqueOrThrow({
      where: { id: cycleId },
    });
    const [employees, rows, reports, holidays] = await Promise.all([
      this.prisma.employee.findMany({
        where: { listImport: { status: ImportStatus.ACTIVE } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.extractedTimeSheetRow.findMany({
        where: {
          employeeId: { not: null },
          document: { batch: { cycleId } },
        },
        include: { document: true },
        orderBy: { document: { uploadedAt: 'desc' } },
      }),
      this.prisma.timeClockReport.findMany({ where: { cycleId } }),
      this.prisma.holiday.findMany({
        where: { date: { gte: cycle.startDate, lte: cycle.endDate } },
      }),
    ]);

    const scannedByEmployee = new Map<string, ScannedCalculationDay[]>();
    const seenEmployeeDocuments = new Set<string>();
    const holidayDates = new Set(
      holidays.map((holiday) => this.isoDate(holiday.date)),
    );
    for (const row of rows) {
      if (!row.employeeId) continue;
      const documentKey = `${row.employeeId}:${row.document.fileName.trim().toLowerCase()}`;
      if (seenEmployeeDocuments.has(documentKey)) continue;
      seenEmployeeDocuments.add(documentKey);
      const employeeDays = scannedByEmployee.get(row.employeeId) ?? [];
      for (const day of this.scannedDays(row.days)) {
        employeeDays.push({
          date: day.date,
          value: day.value,
          needsReview: day.needsReview,
          rowRequiresReview: row.requiresReview,
          rowId: row.id,
          documentId: row.documentId,
          fileName: row.document.fileName,
          storageUrl: row.document.storageUrl,
        });
      }
      scannedByEmployee.set(row.employeeId, employeeDays);
    }

    const openDays = this.countOpenDays(
      cycle.startDate,
      cycle.endDate,
      holidayDates,
    );
    const adjustmentMinutes = (22 - openDays) * 480;
    const reportByEmployee = new Map(
      reports.map((report) => [
        report.employeeId,
        this.normalizeReportDays(report.days),
      ]),
    );
    const cycleDates = this.listDates(cycle.startDate, cycle.endDate);
    const extractedEmployees = employees.filter((employee) =>
      scannedByEmployee.has(employee.id),
    );
    const results = extractedEmployees.map((employee) =>
      this.engine.calculate({
        employeeId: employee.id,
        scannedDays: scannedByEmployee.get(employee.id) ?? [],
        timeClockDays: reportByEmployee.get(employee.id) ?? [],
        holidayDates,
        adjustmentMinutes,
        cycleDates,
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      const run = await tx.calculationRun.upsert({
        where: { cycleId },
        create: { cycleId, openDays, adjustmentMinutes },
        update: {
          openDays,
          adjustmentMinutes,
          launchedAt: new Date(),
        },
      });
      await tx.employeeCalculation.deleteMany({ where: { runId: run.id } });
      await tx.employeeCalculation.createMany({
        data: results.map((result) => ({
          runId: run.id,
          employeeId: result.employeeId,
          normalMinutes: result.normalMinutes,
          absenceDays: result.absenceDays,
          stcDays: result.stcDays,
          paidLeaveDays: result.paidLeaveDays,
          sickLeaveDays: result.sickLeaveDays,
          overtimeMiniMinutes: result.overtimeMiniMinutes,
          overtimeMaxiMinutes: result.overtimeMaxiMinutes,
          displacementDays: result.displacementDays,
          requiresReview: result.requiresReview,
          warnings: result.warnings as Prisma.InputJsonValue,
          details: result.details as unknown as Prisma.InputJsonValue,
        })),
      });
    });
  }

  private scannedDays(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value as {
      date: string;
      value: string;
      needsReview: boolean;
    }[];
  }

  private normalizeReportDays(value: unknown): ParsedTimeClockDay[] {
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
        this.inferDayType(date, sourceState, punches);
      const storedMinutes =
        typeof day['workedMinutes'] === 'number'
          ? day['workedMinutes']
          : null;
      const workedMinutes =
        storedMinutes ??
        (dayType === 'ABSENT' ||
        dayType === 'WEEKEND' ||
        dayType === 'HOLIDAY'
          ? 0
          : null);
      const durationSource =
        (day['durationSource'] as TimeClockDurationSource | undefined) ??
        (workedMinutes === null
          ? 'MISSING'
          : punches.length >= 2
            ? 'CALCULATED'
            : dayType === 'UNKNOWN'
              ? 'MANUAL'
              : 'STATE');
      const warnings = Array.isArray(day['warnings'])
        ? day['warnings'].map(String)
        : [];
      return {
        date,
        sourceState,
        dayType,
        punches,
        workedMinutes,
        durationSource,
        needsReview:
          dayType === 'UNKNOWN' ||
          (Boolean(day['needsReview']) && warnings.length > 0),
        warnings,
      };
    });
  }

  private calculationDetails(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value as {
      date: string;
      values: string[];
      dayType: 'WORKDAY' | 'WEEKEND' | 'HOLIDAY';
      workedMinutes: number;
      absenceDay: boolean;
      stcDay: boolean;
      paidLeaveDay: boolean;
      sickLeaveDay: boolean;
      requiresReview: boolean;
    }[];
  }

  private decimalHours(minutes: number) {
    return Math.round((minutes / 60) * 100) / 100;
  }

  private exportDayType(type: 'WORKDAY' | 'WEEKEND' | 'HOLIDAY') {
    if (type === 'HOLIDAY') return 'Férié';
    if (type === 'WEEKEND') return 'Week-end';
    return 'Ouvrable';
  }

  private inferDayType(
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
    if (/week\s*end|weekend|repos/.test(state) || this.isWeekend(date)) {
      return 'WEEKEND';
    }
    return punches.length >= 2 ? 'WORKED' : 'UNKNOWN';
  }

  private countOpenDays(start: Date, end: Date, holidays: Set<string>) {
    let count = 0;
    for (
      let current = new Date(start);
      current <= end;
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const date = this.isoDate(current);
      if (!this.isWeekend(date) && !holidays.has(date)) count += 1;
    }
    return count;
  }

  private listDates(start: Date, end: Date) {
    const dates: string[] = [];
    for (
      let current = new Date(start);
      current <= end;
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
    ) {
      dates.push(this.isoDate(current));
    }
    return dates;
  }

  private isWeekend(date: string) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return weekday === 5 || weekday === 6;
  }

  private isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
