export interface TimeClockDay {
  date: string;
  punches: string[];
  durationMinutes: number;
  state: 'WORKED' | 'ABSENT' | 'WEEKEND' | 'EMPTY';
  stateLabel: string;
  needsReview: boolean;
}

export interface TimeClockReportEmployee {
  id: string;
  sourceEmployeeNumber: string | null;
  sourceFullName: string;
  days: TimeClockDay[];
  requiresReview: boolean;
  employee: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface TimeClockReport {
  id: string;
  fileName: string;
  storageUrl: string | null;
  importedAt: string;
  employees: TimeClockReportEmployee[];
}
