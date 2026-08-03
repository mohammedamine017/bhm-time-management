import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  EmployeeImportHistory,
  EmployeeImportPreview,
  EmployeeListImport,
} from './employee.models';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  active() {
    return this.http.get<EmployeeListImport | null>(
      `${this.apiUrl}/employees/active`,
    );
  }

  history() {
    return this.http.get<EmployeeImportHistory[]>(
      `${this.apiUrl}/employee-imports/history`,
    );
  }

  preview(file: File) {
    return this.http.post<EmployeeImportPreview>(
      `${this.apiUrl}/employee-imports/preview`,
      this.formData(file),
    );
  }

  confirm(file: File) {
    return this.http.post<EmployeeListImport>(
      `${this.apiUrl}/employee-imports/confirm`,
      this.formData(file),
    );
  }

  removeActive() {
    return this.http.delete<{ deleted: boolean }>(
      `${this.apiUrl}/employee-imports/active`,
    );
  }

  private formData(file: File) {
    const data = new FormData();
    data.append('file', file);
    return data;
  }
}
