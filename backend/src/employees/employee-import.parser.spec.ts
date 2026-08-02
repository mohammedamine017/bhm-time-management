import ExcelJS from 'exceljs';
import { EmployeeImportParser } from './employee-import.parser';

describe('EmployeeImportParser', () => {
  const parser = new EmployeeImportParser();

  it('reads the required employee columns from an xlsx workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employes');
    sheet.addRow(['Matricule', 'Prenom', 'Nom']);
    sheet.addRow(['BHM-001', 'Ahmed', 'Benali']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parser.parse(buffer)).resolves.toEqual([
      {
        matricule: 'BHM-001',
        firstName: 'Ahmed',
        lastName: 'Benali',
        normalizedFullName: 'AHMED BENALI',
      },
    ]);
  });

  it('rejects duplicate matricules', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employes');
    sheet.addRow(['Matricule', 'Prenom', 'Nom']);
    sheet.addRow(['BHM-001', 'Ahmed', 'Benali']);
    sheet.addRow(['BHM-001', 'Ali', 'Mansouri']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parser.parse(buffer)).rejects.toThrow('en double');
  });
});
