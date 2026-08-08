import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = 'C:\\Users\\Dell\\Documents\\Codex\\2026-07-07\\bas\\bhm-time-management-v2\\outputs';
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Rapport pointeuse');

sheet.getRange('A1:L4').values = [
  [
    'Num',
    'Nom et Prénom',
    'Jour',
    'Date',
    'Temp 1',
    'Temp 2',
    'Temp 3',
    'Temp 4',
    'Temp 5',
    'Temp 6',
    'Temp 7',
    'Etat',
  ],
  ['1', 'Amine Benabdallah', 'Lundi', '20/07/2026', '08:00', '12:00', '13:00', '16:30', '', '', '', ''],
  ['1', 'Amine Benabdallah', 'Mardi', '21/07/2026', '08:00', '12:00', '13:00', '17:00', '', '', '', ''],
  ['1', 'Amine Benabdallah', 'Mercredi', '22/07/2026', '', '', '', '', '', '', '', 'Absent(e)'],
];

sheet.getRange('A1:L1').format = {
  fill: '#1456A0',
  font: { bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
};
sheet.getRange('A1:L4').format.borders = {
  preset: 'all',
  style: 'thin',
  color: '#D7E0EA',
};
sheet.getRange('A1:A4').format.horizontalAlignment = 'center';
sheet.getRange('C1:L4').format.horizontalAlignment = 'center';
sheet.getRange('A1:A4').format.columnWidth = 10;
sheet.getRange('B1:B4').format.columnWidth = 25;
sheet.getRange('C1:C4').format.columnWidth = 14;
sheet.getRange('D1:D4').format.columnWidth = 14;
sheet.getRange('E1:K4').format.columnWidth = 11;
sheet.getRange('L1:L4').format.columnWidth = 16;
sheet.freezePanes.freezeRows(1);
sheet.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/rapport_pointeuse_amine_benabdallah.xlsx`);

const check = await workbook.inspect({
  kind: 'table',
  range: 'Rapport pointeuse!A1:L4',
  include: 'values',
  tableMaxRows: 4,
  tableMaxCols: 12,
});
console.log(check.ndjson);
