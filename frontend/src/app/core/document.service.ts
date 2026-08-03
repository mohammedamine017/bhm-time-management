import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ArchivedDocument } from './document.models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly apiUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  archive() {
    return this.http.get<ArchivedDocument[]>(
      `${this.apiUrl}/documents/archive`,
    );
  }
}
