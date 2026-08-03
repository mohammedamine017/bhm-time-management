import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { PayrollCycle } from './cycle.models';

@Injectable({ providedIn: 'root' })
export class CycleService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  getActive(month?: string) {
    return this.http.get<PayrollCycle>(`${this.apiUrl}/cycles/active`, {
      params: month ? { month } : {},
    });
  }

  reset(month: string, resetEmployees: boolean) {
    return this.http.post<{ cycle: PayrollCycle; resetEmployees: boolean }>(
      `${this.apiUrl}/cycles/reset`,
      { resetEmployees },
      { params: { month } },
    );
  }
}
