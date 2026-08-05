export type TimeClockDayState = 'WORKED' | 'ABSENT' | 'WEEKEND' | 'EMPTY';

export interface ParsedTimeClockDay {
  date: string;
  punches: string[];
  durationMinutes: number;
  state: TimeClockDayState;
  stateLabel: string;
  needsReview: boolean;
}

export interface ParsedTimeClockEmployee {
  sourceEmployeeNumber: string | null;
  sourceFullName: string;
  days: ParsedTimeClockDay[];
  requiresReview: boolean;
}

export interface UploadedTimeClockFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}
