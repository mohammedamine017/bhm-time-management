export interface ArchivedDocument {
  id: string;
  type: 'TIME_SHEET' | 'TIME_CLOCK' | 'EMPLOYEE_LIST';
  fileName: string;
  storageUrl: string | null;
  importedAt: string;
  payrollMonth: string | null;
  detail: string;
}
