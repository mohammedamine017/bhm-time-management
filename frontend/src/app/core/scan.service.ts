import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ExtractedRow, ScanBatch, ScanDocument, ScanQr } from './scan.models';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  qr() {
    return this.http.get<ScanQr>(`${this.apiUrl}/scans/qr`);
  }

  latest(month?: string) {
    return this.http.get<ScanBatch | null>(`${this.apiUrl}/scans/latest`, {
      params: {
        ...(month ? { month } : {}),
        refresh: Date.now().toString(),
      },
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

  retryDocument(documentId: string) {
    return this.http.post<ScanDocument>(
      `${this.apiUrl}/scans/documents/${documentId}/retry`,
      {},
    );
  }

  deleteDocument(documentId: string) {
    return this.http.delete<{ deleted: boolean }>(
      `${this.apiUrl}/scans/documents/${documentId}`,
    );
  }
}
