import * as XLSX from 'xlsx';
import { TimeClockParserService } from './time-clock-parser.service';

describe('TimeClockParserService', () => {
  const parser = new TimeClockParserService();

  it('lit le format où la date précède la ligne employé', () => {
    const buffer = workbook([
      ['N° Emp', 'Nom et Prénom', 'Tmp 1', 'Tmp 2', 'Tmp 3', 'Tmp 4', 'Tmp 5', 'Etat'],
      ['', 'Lundi', '22/06/2026'],
      ['5', 'BEGHDADLI Anes', '08:00:00', '12:00:00', '13:00:00', '17:00:00', '130000', ''],
    ]);

    expect(parser.parse(buffer)).toEqual([
      expect.objectContaining({
        sourceEmployeeNumber: '5',
        sourceFullName: 'BEGHDADLI Anes',
        requiresReview: false,
        days: [
          expect.objectContaining({
            date: '2026-06-22',
            punches: ['08:00:00', '12:00:00', '13:00:00', '17:00:00'],
            durationMinutes: 510,
          }),
        ],
      }),
    ]);
  });

  it('lit le format où identité, jour, date et pointages sont sur la même ligne', () => {
    const buffer = workbook([
      ['Num', 'Nom et Prénom', 'Jour', 'Date', 'Temp 1', 'Temp 2', 'Etat'],
      ['8', 'Nadia Khellaf', 'Mardi', '23/06/2026', '08:15:00', '16:45:00', ''],
    ]);

    expect(parser.parse(buffer)[0]).toMatchObject({
      sourceEmployeeNumber: '8',
      sourceFullName: 'Nadia Khellaf',
      days: [
        {
          date: '2026-06-23',
          punches: ['08:15:00', '16:45:00'],
          durationMinutes: 540,
          state: 'WORKED',
          stateLabel: '',
          needsReview: false,
        },
      ],
    });
  });

  function workbook(rows: unknown[][]) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Rapport');
    return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  }
});
