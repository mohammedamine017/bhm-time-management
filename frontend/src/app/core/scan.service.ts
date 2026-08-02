import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ExtractedRow, ScanBatch, ScanQr } from './scan.models';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly apiUrl = `${window.location.protocol}//${window.location.hostname}:3006`;

  constructor(private readonly http: HttpClient) {}

  qr() {
    return this.http.get<ScanQr>(`${this.apiUrl}/scans/qr`);
  }

  latest(month?: string) {
    return this.http.get<ScanBatch | null>(`${this.apiUrl}/scans/latest`, {
      params: month ? { month } : {},
    });
  }

  upload(files: File[]) {
    const data = new FormData();
    for (const file of files) data.append('files', file);
    return this.http.post<ScanBatch>(`${this.apiUrl}/scans/batches`, data);
  }

  updateDay(rowId: string, date: string, value: string) {
    return this.http.patch<ExtractedRow>(
      `${this.apiUrl}/scans/rows/${rowId}/days/${date}`,
      { value },
    );
  }
}
