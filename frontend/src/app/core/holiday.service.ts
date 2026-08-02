import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Holiday } from './holiday.models';

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private readonly apiUrl = `${window.location.protocol}//${window.location.hostname}:3006`;

  constructor(private readonly http: HttpClient) {}

  list(month: string) {
    return this.http.get<Holiday[]>(`${this.apiUrl}/holidays`, {
      params: { month },
    });
  }

  create(date: string, label: string, month: string) {
    return this.http.post<Holiday>(
      `${this.apiUrl}/holidays`,
      { date, label },
      { params: { month } },
    );
  }

  remove(id: string, month: string) {
    return this.http.delete<{ deleted: boolean }>(
      `${this.apiUrl}/holidays/${id}`,
      { params: { month } },
    );
  }
}
