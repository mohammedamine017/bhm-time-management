export type PayrollCycle = {
  id: string;
  payrollMonth: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'RESET';
};

