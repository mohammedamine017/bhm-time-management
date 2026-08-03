export interface ExtractedDay {
  date: string;
  value: string;
  confidence: number;
  needsReview: boolean;
}

export interface ExtractedRow {
  id: string;
  employeeId?: string | null;
  extractedFullName: string;
  matchedFullName?: string | null;
  requiresReview: boolean;
  days: ExtractedDay[];
}

export interface ScanDocument {
  id: string;
  fileName: string;
  mimeType: string;
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED';
  storageUrl?: string | null;
  errorMessage?: string | null;
  uploadedAt: string;
  extractedRows: ExtractedRow[];
}

export interface ScanBatch {
  id: string;
  batchCount: number;
  status: 'PROCESSING' | 'EXTRACTED' | 'FAILED';
  createdAt: string;
  extractedAt?: string | null;
  errorMessage?: string | null;
  documents: ScanDocument[];
}

export interface ScanQr {
  mobileUrl: string;
  dataUrl: string;
}
