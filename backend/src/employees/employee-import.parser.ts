import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface ParsedEmployee {
  matricule: string;
  firstName: string;
  lastName: string;
  normalizedFullName: string;
}

@Injectable()
export class EmployeeImportParser {
  async parse(buffer: Buffer): Promise<ParsedEmployee[]> {
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw new BadRequestException(
        'Le fichier doit etre un classeur Excel .xlsx valide.',
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Le fichier Excel ne contient aucune feuille.');
    }

    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      headers.set(this.normalizeHeader(String(cell.value ?? '')), column);
    });

    const matriculeColumn = this.findColumn(headers, ['matricule', 'code']);
    const firstNameColumn = this.findColumn(headers, ['prenom', 'firstname']);
    const lastNameColumn = this.findColumn(headers, ['nom', 'lastname']);

    if (!matriculeColumn || !firstNameColumn || !lastNameColumn) {
      throw new BadRequestException(
        'Colonnes requises: Matricule, Prenom et Nom.',
      );
    }

    const employees: ParsedEmployee[] = [];
    const seen = new Set<string>();

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const matricule = this.cellText(row.getCell(matriculeColumn).value);
      const firstName = this.cellText(row.getCell(firstNameColumn).value);
      const lastName = this.cellText(row.getCell(lastNameColumn).value);

      if (!matricule && !firstName && !lastName) continue;
      if (!matricule || !firstName || !lastName) {
        throw new BadRequestException(
          `Ligne ${rowNumber}: matricule, prenom et nom sont obligatoires.`,
        );
      }
      if (seen.has(matricule)) {
        throw new BadRequestException(
          `Ligne ${rowNumber}: matricule ${matricule} en double.`,
        );
      }

      seen.add(matricule);
      employees.push({
        matricule,
        firstName,
        lastName,
        normalizedFullName: this.normalizeName(`${firstName} ${lastName}`),
      });
    }

    if (!employees.length) {
      throw new BadRequestException('Aucun employe trouve dans le fichier.');
    }

    return employees;
  }

  normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private normalizeHeader(value: string): string {
    return this.normalizeName(value).replace(/[^A-Z]/g, '').toLowerCase();
  }

  private findColumn(headers: Map<string, number>, names: string[]) {
    for (const name of names) {
      const column = headers.get(name);
      if (column) return column;
    }
    return undefined;
  }

  private cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && 'text' in value) {
      return String(value.text).trim();
    }
    return String(value).trim();
  }
}
