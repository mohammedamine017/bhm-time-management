import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  TimeClockReport,
  TimeClockReportEmployee,
} from './time-clock.models';

@Injectable({ providedIn: 'root' })
export class TimeClockService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  list(month: string) {
    return this.http.get<TimeClockReport[]>(
      `${this.apiUrl}/time-clock-reports`,
      { params: { month } },
    );
  }

  import(files: File[], month: string) {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return this.http.post<TimeClockReport[]>(
      `${this.apiUrl}/time-clock-reports`,
      form,
      { params: { month } },
    );
  }

  updateDay(entryId: string, date: string, durationMinutes: number) {
    return this.http.patch<TimeClockReportEmployee>(
      `${this.apiUrl}/time-clock-reports/${entryId}/days/${date}`,
      { durationMinutes },
    );
  }
}
