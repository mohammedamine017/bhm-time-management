import type { ParsedTimeClockDay } from '../time-clock/time-clock.types';

export interface ScannedCalculationDay {
  date: string;
  value: string;
  needsReview: boolean;
  rowRequiresReview: boolean;
  rowId: string;
  documentId: string;
  fileName: string;
  storageUrl: string | null;
}

export interface EmployeeCalculationInput {
  employeeId: string;
  scannedDays: ScannedCalculationDay[];
  timeClockDays: ParsedTimeClockDay[];
  holidayDates: Set<string>;
  adjustmentMinutes: number;
  cycleDates?: string[];
}

export interface CalculationDayDetail {
  date: string;
  values: string[];
  dayType: 'WORKDAY' | 'WEEKEND' | 'HOLIDAY';
  workedMinutes: number;
  normalMinutes: number;
  absenceDay: boolean;
  stcDay: boolean;
  paidLeaveDay: boolean;
  sickLeaveDay: boolean;
  overtimeMiniMinutes: number;
  overtimeMaxiMinutes: number;
  displacement: boolean;
  requiresReview: boolean;
  warnings: string[];
  sources: {
    rowId: string;
    documentId: string;
    fileName: string;
    storageUrl: string | null;
    value: string;
    needsReview: boolean;
  }[];
}

export interface EmployeeCalculationOutput {
  employeeId: string;
  normalMinutes: number;
  absenceDays: number;
  stcDays: number;
  paidLeaveDays: number;
  sickLeaveDays: number;
  overtimeMiniMinutes: number;
  overtimeMaxiMinutes: number;
  displacementDays: number;
  requiresReview: boolean;
  warnings: string[];
  details: CalculationDayDetail[];
}
