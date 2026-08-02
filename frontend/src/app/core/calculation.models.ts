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
    value?: string;
    needsReview?: boolean;
  }[];
}

export interface EmployeeCalculation {
  id: string;
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
  employee: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
  };
}

export interface CalculationStatus {
  canLaunch: boolean;
  prerequisites: {
    employeesReady: boolean;
    scansReady: boolean;
    reportsReady: boolean;
    employeeCount: number;
    scannedRowCount: number;
    requiredReportCount: number;
    missingReportCount: number;
  };
  run: {
    id: string;
    openDays: number;
    adjustmentMinutes: number;
    launchedAt: string;
    results: EmployeeCalculation[];
  } | null;
}

export interface CalculationHistoryItem {
  id: string;
  cycle: {
    payrollMonth: string;
    startDate: string;
    endDate: string;
  };
  openDays: number;
  adjustmentMinutes: number;
  launchedAt: string;
  archivedAt: string | null;
  employeeCount: number;
  reviewCount: number;
  totals: {
    normalMinutes: number;
    absenceDays: number;
    stcDays: number;
    paidLeaveDays: number;
    sickLeaveDays: number;
    overtimeMiniMinutes: number;
    overtimeMaxiMinutes: number;
    displacementDays: number;
  };
}

export interface CalculationHistoryRun {
  id: string;
  openDays: number;
  adjustmentMinutes: number;
  launchedAt: string;
  cycle: {
    payrollMonth: string;
    startDate: string;
    endDate: string;
  };
  results: EmployeeCalculation[];
}
