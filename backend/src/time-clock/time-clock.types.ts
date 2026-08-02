export type TimeClockDayType =
  | 'WORKED'
  | 'ABSENT'
  | 'WEEKEND'
  | 'HOLIDAY'
  | 'UNKNOWN';

export type TimeClockDurationSource =
  | 'CALCULATED'
  | 'MANUAL'
  | 'STATE'
  | 'MISSING';

export interface ParsedTimeClockDay {
  date: string;
  sourceState: string | null;
  dayType: TimeClockDayType;
  punches: string[];
  workedMinutes: number | null;
  durationSource: TimeClockDurationSource;
  needsReview: boolean;
  warnings: string[];
}

export interface UploadedTimeClockFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
}

export interface RequiredTimeClockEmployee {
  employee: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
  };
  requiredDates: string[];
  report: {
    id: string;
    fileName: string;
    storageUrl: string | null;
    importedAt: Date;
    days: ParsedTimeClockDay[];
  } | null;
}
