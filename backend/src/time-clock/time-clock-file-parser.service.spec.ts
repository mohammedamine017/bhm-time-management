import ExcelJS from 'exceljs';
import { TimeClockFileParserService } from './time-clock-file-parser.service';
import { UploadedTimeClockFile } from './time-clock.types';

describe('TimeClockFileParserService', () => {
  const parser = new TimeClockFileParserService();

  it('calcule les paires entree-sortie et ignore un doublon consecutif', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pointage');
    sheet.addRow([
      'N Emp',
      'Nom et Prénom',
      'Tmp1',
      'Tmp2',
      'Tmp3',
      'Tmp4',
      'Tmp5',
      'Etat',
    ]);
    sheet.addRow(['21/06/2026']);
    sheet.addRow([
      '5',
      'BEGHDADLI Anes',
      '08:00:00',
      '12:00:00',
      '13:00:00',
      '17:00:00',
      '17:00:00',
      'Pointage',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parser.parse({
      originalname: 'rapport.xlsx',
      buffer: Buffer.from(buffer),
    } as UploadedTimeClockFile);

    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-06-21',
        punches: ['08:00:00', '12:00:00', '13:00:00', '17:00:00'],
        workedMinutes: 480,
        needsReview: false,
      }),
    ]);
  });

  it('signale un pointage non apparie', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pointage');
    sheet.addRow(['N Emp', 'Nom et Prénom', 'Tmp1', 'Tmp2', 'Tmp3']);
    sheet.addRow(['22/06/2026']);
    sheet.addRow(['5', 'BEGHDADLI Anes', '08:00', '12:00', '13:00']);
    const buffer = await workbook.xlsx.writeBuffer();

    const [day] = await parser.parse({
      originalname: 'rapport.xlsx',
      buffer: Buffer.from(buffer),
    } as UploadedTimeClockFile);

    expect(day.workedMinutes).toBe(240);
    expect(day.needsReview).toBe(true);
    expect(day.warnings).toContain('POINTAGE_NON_APPAIRÉ');
  });

  it('normalise absence, week-end et jour ferie', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pointage');
    sheet.addRow(['N Emp', 'Nom et Prénom', 'Tmp1', 'Etat']);
    sheet.addRow(['23/06/2026']);
    sheet.addRow(['5', 'BEGHDADLI Anes', '', 'Absent(e)']);
    sheet.addRow(['24/06/2026']);
    sheet.addRow(['5', 'BEGHDADLI Anes', '', 'Férié']);
    sheet.addRow(['26/06/2026']);
    sheet.addRow(['5', 'BEGHDADLI Anes', '', '']);
    const buffer = await workbook.xlsx.writeBuffer();

    const days = await parser.parse({
      originalname: 'rapport.xlsx',
      buffer: Buffer.from(buffer),
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as UploadedTimeClockFile);

    expect(days.map(({ dayType, workedMinutes, needsReview }) => ({
      dayType,
      workedMinutes,
      needsReview,
    }))).toEqual([
      { dayType: 'ABSENT', workedMinutes: 0, needsReview: false },
      { dayType: 'HOLIDAY', workedMinutes: 0, needsReview: false },
      { dayType: 'WEEKEND', workedMinutes: 0, needsReview: false },
    ]);
  });
});
