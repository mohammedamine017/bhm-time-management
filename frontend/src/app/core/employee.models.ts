export interface Employee {
  id?: string;
  matricule: string;
  firstName: string;
  lastName: string;
  normalizedFullName: string;
}

export interface EmployeeListImport {
  id: string;
  fileName: string;
  status: 'ACTIVE' | 'ARCHIVED';
  importedAt: string;
  archivedAt?: string | null;
  storageUrl?: string | null;
  employees: Employee[];
}

export interface EmployeeImportPreview {
  fileName: string;
  total: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  employees: Employee[];
}

export type EmployeeImportHistory = Omit<EmployeeListImport, 'employees'>;
