export interface TimeClockDay {
  date: string;
  sourceState: string | null;
  dayType: 'WORKED' | 'ABSENT' | 'WEEKEND' | 'HOLIDAY' | 'UNKNOWN';
  punches: string[];
  workedMinutes: number | null;
  durationSource: 'CALCULATED' | 'MANUAL' | 'STATE' | 'MISSING';
  needsReview: boolean;
  warnings: string[];
}

export interface RequiredTimeClockEmployee {
  employee: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
  };
  requiredDates: string[];
  unresolvedDates: string[];
  report: {
    id: string;
    fileName: string;
    storageUrl: string | null;
    importedAt: string;
    days: TimeClockDay[];
  } | null;
}

export interface RequiredTimeClockReports {
  cycleId: string;
  requiredCount: number;
  readyCount: number;
  missingCount: number;
  isReady: boolean;
  employees: RequiredTimeClockEmployee[];
}
