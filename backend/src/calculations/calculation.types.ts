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
  administrationDays?: AdministrationCalculationDay[];
  holidayDates: Set<string>;
  adjustmentMinutes: number;
  cycleDates?: string[];
}

export interface AdministrationCalculationDay {
  date: string;
  durationMinutes: number;
  punches: string[];
  state: 'WORKED' | 'ABSENT' | 'WEEKEND' | 'EMPTY';
  stateLabel: string;
  needsReview: boolean;
  reportId: string;
  fileName: string;
  storageUrl: string | null;
}

export interface CalculationDayDetail {
  date: string;
  values: string[];
  dayType: 'WORKDAY' | 'WEEKEND' | 'HOLIDAY';
  workedMinutes: number;
  administrationMinutes: number;
  normalMinutes: number;
  absenceDay: boolean;
  stcDay: boolean;
  paidLeaveDay: boolean;
  sickLeaveDay: boolean;
  overtimeMiniMinutes: number;
  overtimeMaxiMinutes: number;
  displacement: boolean;
  taskDay: boolean;
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
  absenceMinutes: number;
  stcDays: number;
  paidLeaveDays: number;
  sickLeaveDays: number;
  overtimeMiniMinutes: number;
  overtimeMaxiMinutes: number;
  displacementDays: number;
  taskDays: number;
  requiresReview: boolean;
  warnings: string[];
  details: CalculationDayDetail[];
}
