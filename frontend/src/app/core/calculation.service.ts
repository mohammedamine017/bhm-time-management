import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  CalculationHistoryItem,
  CalculationHistoryRun,
  CalculationStatus,
} from './calculation.models';

@Injectable({ providedIn: 'root' })
export class CalculationService {
  private readonly apiUrl = `${window.location.protocol}//${window.location.hostname}:3006`;

  constructor(private readonly http: HttpClient) {}

  status(month: string) {
    return this.http.get<CalculationStatus>(
      `${this.apiUrl}/calculations/status`,
      { params: { month } },
    );
  }

  launch(month: string) {
    return this.http.post<CalculationStatus>(
      `${this.apiUrl}/calculations/launch`,
      null,
      { params: { month } },
    );
  }

  exportAll(month: string) {
    return this.http.get(`${this.apiUrl}/calculations/export`, {
      params: { month },
      responseType: 'blob',
    });
  }

  exportEmployee(month: string, employeeId: string) {
    return this.http.get(
      `${this.apiUrl}/calculations/${employeeId}/export`,
      {
        params: { month },
        responseType: 'blob',
      },
    );
  }

  history() {
    return this.http.get<CalculationHistoryItem[]>(
      `${this.apiUrl}/calculations/history`,
    );
  }

  historyRun(runId: string) {
    return this.http.get<CalculationHistoryRun>(
      `${this.apiUrl}/calculations/history/${runId}`,
    );
  }

  exportHistory(runId: string, employeeId?: string) {
    return this.http.get(
      `${this.apiUrl}/calculations/history/${runId}/export`,
      {
        params: employeeId ? { employeeId } : {},
        responseType: 'blob',
      },
    );
  }
}
