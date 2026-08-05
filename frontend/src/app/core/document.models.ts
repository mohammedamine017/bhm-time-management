export interface ArchivedDocument {
  id: string;
  type: 'TIME_SHEET' | 'EMPLOYEE_LIST' | 'TIME_CLOCK';
  fileName: string;
  storageUrl: string | null;
  importedAt: string;
  payrollMonth: string | null;
  detail: string;
}
