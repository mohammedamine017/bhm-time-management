import { Injectable } from '@nestjs/common';
import { parseTimeSheetDayValue } from '../common/time-sheet-day-value';
import {
  CalculationDayDetail,
  EmployeeCalculationInput,
  EmployeeCalculationOutput,
} from './calculation.types';

@Injectable()
export class CalculationEngineService {
  calculate(input: EmployeeCalculationInput): EmployeeCalculationOutput {
    const scannedByDate = new Map<
      string,
      EmployeeCalculationInput['scannedDays']
    >();
    for (const day of input.scannedDays) {
      const current = scannedByDate.get(day.date) ?? [];
      current.push(day);
      scannedByDate.set(day.date, current);
    }
    const dates = [...new Set([
      ...(input.cycleDates ?? []),
      ...scannedByDate.keys(),
    ])].sort();

    const details = dates
      .map((date) =>
        this.calculateDay(
          date,
          scannedByDate.get(date) ?? [],
          input.holidayDates,
        ),
      );
    const totals = details.reduce(
      (result, day) => ({
        normalMinutes: result.normalMinutes + day.normalMinutes,
        absenceDays: result.absenceDays + (day.absenceDay ? 1 : 0),
        stcDays: result.stcDays + (day.stcDay ? 1 : 0),
        paidLeaveDays:
          result.paidLeaveDays + (day.paidLeaveDay ? 1 : 0),
        sickLeaveDays: result.sickLeaveDays + (day.sickLeaveDay ? 1 : 0),
        overtimeMiniMinutes:
          result.overtimeMiniMinutes + day.overtimeMiniMinutes,
        overtimeMaxiMinutes:
          result.overtimeMaxiMinutes + day.overtimeMaxiMinutes,
        displacementDays:
          result.displacementDays + (day.displacement ? 1 : 0),
        taskDays: result.taskDays + (day.taskDay ? 1 : 0),
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
        taskDays: 0,
      },
    );
    totals.normalMinutes = Math.max(
      0,
      totals.normalMinutes + input.adjustmentMinutes,
    );

    const warnings = [...new Set(details.flatMap((day) => day.warnings))];
    const rowRequiresReview = input.scannedDays.some(
      (day) => day.rowRequiresReview,
    );
    if (rowRequiresReview) {
      warnings.push('La feuille contient au moins une case à vérifier');
    }
    return {
      employeeId: input.employeeId,
      ...totals,
      requiresReview:
        rowRequiresReview || details.some((day) => day.requiresReview),
      warnings: [...new Set(warnings)],
      details,
    };
  }

  private calculateDay(
    date: string,
    scannedDays: EmployeeCalculationInput['scannedDays'],
    holidayDates: Set<string>,
  ): CalculationDayDetail {
    const parsedValues = scannedDays.map((day) =>
      parseTimeSheetDayValue(day.value),
    );
    const rawValues = parsedValues
      .map((value) => value.normalized)
      .filter(Boolean);
    const values = [...new Set(rawValues)];
    const warnings: string[] = [];
    let workedMinutes = 0;
    let absence = values.some((value) => ['A', '0', 'X'].includes(value));
    const hasStc = values.includes('STC');
    const hasPaidLeave = values.includes('CP');
    const hasSickLeave = values.includes('MA');
    const hasRecovery = values.includes('RC');
    const displacement = parsedValues.some((value) => value.displacement);
    const taskDay = values.includes('T');

    for (const value of values) {
      const parsedValue = parseTimeSheetDayValue(value);
      if (parsedValue.hours !== null) {
        workedMinutes += Math.round(parsedValue.hours * 60);
      }
    }
    if (hasRecovery) {
      if (workedMinutes > 0) {
        warnings.push(`${date}: récupération et présence simultanées`);
      } else {
        workedMinutes = 480;
      }
    }

    const hasAbsenceRubric =
      absence || hasStc || hasPaidLeave || hasSickLeave;
    if (hasAbsenceRubric && workedMinutes > 0) {
      warnings.push(`${date}: présence et code d’absence simultanés`);
    }
    if (parsedValues.some((value) => !value.supported)) {
      warnings.push(`${date}: valeur non reconnue`);
    }

    const isHoliday =
      holidayDates.has(date) ||
      parsedValues.some((value) => value.holiday);
    const isWeekend = this.isWeekend(date);
    const dayType = isHoliday
      ? 'HOLIDAY'
      : isWeekend
        ? 'WEEKEND'
        : 'WORKDAY';
    const countAbsenceRubric =
      workedMinutes === 0 && dayType === 'WORKDAY';

    let normalMinutes = 0;
    let overtimeMiniMinutes = 0;
    let overtimeMaxiMinutes = 0;
    if (dayType === 'HOLIDAY') {
      overtimeMaxiMinutes = workedMinutes;
    } else if (dayType === 'WEEKEND') {
      if (this.isFriday(date)) {
        overtimeMaxiMinutes = workedMinutes;
      } else {
        overtimeMiniMinutes = workedMinutes;
      }
    } else {
      normalMinutes = Math.min(workedMinutes, 480);
      overtimeMiniMinutes = Math.max(0, workedMinutes - 480);
    }

    const sourceRequiresReview = scannedDays.some((day) => day.needsReview);
    const requiresReview = sourceRequiresReview || warnings.length > 0;

    return {
      date,
      values,
      dayType,
      workedMinutes,
      normalMinutes,
      absenceDay: absence && countAbsenceRubric,
      stcDay: hasStc && countAbsenceRubric,
      paidLeaveDay: hasPaidLeave && countAbsenceRubric,
      sickLeaveDay: hasSickLeave && countAbsenceRubric,
      overtimeMiniMinutes,
      overtimeMaxiMinutes,
      displacement,
      taskDay,
      requiresReview,
      warnings: [...new Set(warnings)],
      sources: scannedDays.map((day) => ({
        rowId: day.rowId,
        documentId: day.documentId,
        fileName: day.fileName,
        storageUrl: day.storageUrl,
        value: day.value.trim().toUpperCase(),
        needsReview: day.needsReview,
      })),
    };
  }

  private isWeekend(date: string) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return weekday === 5 || weekday === 6;
  }

  private isFriday(date: string) {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5;
  }
}
