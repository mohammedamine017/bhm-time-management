import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RequiredTimeClockReports } from './time-clock.models';

@Injectable({ providedIn: 'root' })
export class TimeClockService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  required(month: string) {
    return this.http.get<RequiredTimeClockReports>(
      `${this.apiUrl}/time-clock-reports/required`,
      { params: { month } },
    );
  }

  import(employeeId: string, file: File, month: string) {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<RequiredTimeClockReports>(
      `${this.apiUrl}/time-clock-reports/${employeeId}`,
      data,
      { params: { month } },
    );
  }

  updateDay(reportId: string, date: string, value: string) {
    return this.http.patch<RequiredTimeClockReports>(
      `${this.apiUrl}/time-clock-reports/${reportId}/days/${date}`,
      { value },
    );
  }
}
