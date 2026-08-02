import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  ParsedTimeClockDay,
  UploadedTimeClockFile,
} from './time-clock.types';

type Grid = string[][];

@Injectable()
export class TimeClockFileParserService {
  async parse(file: UploadedTimeClockFile): Promise<ParsedTimeClockDay[]> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Le rapport pointeuse est vide.');
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    let grid: Grid;
    try {
      grid =
        extension === 'xls'
          ? this.readLegacyWorkbook(file.buffer)
          : await this.readModernWorkbook(file.buffer);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Le rapport doit etre un fichier XLS ou XLSX lisible.',
      );
    }

    const days = this.parseIndividualReport(grid);
    if (!days.length) {
      throw new BadRequestException(
        "Aucune journee de pointage exploitable n'a ete trouvee.",
      );
    }
    return days;
  }

  private async readModernWorkbook(buffer: Buffer): Promise<Grid> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer) as never);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Le rapport ne contient aucune feuille.');
    }

    const grid: Grid = [];
    for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      const values: string[] = [];
      for (
        let columnIndex = 1;
        columnIndex <= worksheet.columnCount;
        columnIndex += 1
      ) {
        values.push(row.getCell(columnIndex).text.trim());
      }
      if (values.some(Boolean)) grid.push(values);
    }
    return grid;
  }

  private readLegacyWorkbook(buffer: Buffer): Grid {
    const reader = require('xlsx') as {
      read(data: Buffer, options: Record<string, unknown>): {
        SheetNames: string[];
        Sheets: Record<string, unknown>;
      };
      utils: {
        sheet_to_json<T>(sheet: unknown, options: Record<string, unknown>): T[];
      };
    };
    const workbook = reader.read(buffer, {
      type: 'buffer',
      raw: false,
      cellDates: true,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new BadRequestException('Le rapport ne contient aucune feuille.');
    }
    return reader.utils
      .sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      })
      .map((row) => row.map((value) => this.text(value)));
  }

  private parseIndividualReport(grid: Grid): ParsedTimeClockDay[] {
    const headerIndex = grid.findIndex((row) => {
      const values = row.map((value) => this.normalizeLabel(value));
      return (
        values.some((value) => value.includes('nom') && value.includes('prenom')) &&
        values.some((value) => /^tmp\s*1$/.test(value))
      );
    });
    if (headerIndex < 0) return [];

    const header = grid[headerIndex].map((value) => this.normalizeLabel(value));
    const nameIndex = header.findIndex(
      (value) => value.includes('nom') && value.includes('prenom'),
    );
    const tmpIndexes = header
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => /^tmp\s*\d+$/.test(value))
      .map(({ index }) => index);

    let currentDate: string | null = null;
    const result: ParsedTimeClockDay[] = [];
    for (const row of grid.slice(headerIndex + 1)) {
      const date = row.map((value) => this.parseDate(value)).find(Boolean) ?? null;
      const name = nameIndex >= 0 ? this.text(row[nameIndex]).trim() : '';
      if (date && !name) {
        currentDate = date;
        continue;
      }
      if (!name) continue;

      const punches = this.uniquePunches(
        tmpIndexes.map((index) => row[index]).filter(Boolean),
      );
      const resolvedDate = date ?? currentDate;
      if (!resolvedDate) continue;
      const sourceState = this.findState(row, tmpIndexes);
      const dayType = this.classifyDay(resolvedDate, sourceState, punches);
      const calculated = this.calculateWorkedMinutes(punches);
      const workedMinutes =
        calculated.workedMinutes ??
        (dayType === 'ABSENT' ||
        dayType === 'WEEKEND' ||
        dayType === 'HOLIDAY'
          ? 0
          : null);
      result.push({
        date: resolvedDate,
        sourceState,
        dayType,
        punches,
        workedMinutes,
        durationSource:
          calculated.workedMinutes !== null
            ? 'CALCULATED'
            : workedMinutes !== null
              ? 'STATE'
              : 'MISSING',
        needsReview:
          calculated.warnings.length > 0 || dayType === 'UNKNOWN',
        warnings:
          dayType === 'UNKNOWN' && calculated.warnings.length === 0
            ? ['ÉTAT_INCONNU']
            : calculated.warnings,
      });
      if (date) currentDate = date;
    }
    return result;
  }

  private calculateWorkedMinutes(punches: string[]) {
    let workedMinutes = 0;
    for (let index = 0; index + 1 < punches.length; index += 2) {
      const start = this.punchToSeconds(punches[index]);
      let end = this.punchToSeconds(punches[index + 1]);
      if (end < start) end += 24 * 60 * 60;
      workedMinutes += Math.round((end - start) / 60);
    }
    return {
      workedMinutes: punches.length >= 2 ? workedMinutes : null,
      warnings: punches.length % 2 === 1 ? ['POINTAGE_NON_APPAIRÉ'] : [],
    };
  }

  private uniquePunches(values: string[]) {
    const result: string[] = [];
    for (const value of values) {
      const punch = this.normalizePunch(value);
      if (punch && !result.includes(punch)) result.push(punch);
    }
    return result;
  }

  private normalizePunch(value: string | undefined) {
    const text = this.text(value).replace(/\s/g, '');
    if (!text) return null;
    if (/^\d{6}$/.test(text)) {
      return `${text.slice(0, 2)}:${text.slice(2, 4)}:${text.slice(4, 6)}`;
    }
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  }

  private punchToSeconds(value: string) {
    const [hours, minutes, seconds] = value.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private findState(row: string[], tmpIndexes: number[]) {
    const values = row.slice(Math.max(...tmpIndexes) + 1).filter(Boolean);
    return (
      values.find((value) =>
        /(absent|week\s*end|repos|conge|pointage|present|f[eé]ri[eé])/i.test(value),
      ) ?? null
    );
  }

  private classifyDay(
    date: string,
    sourceState: string | null,
    punches: string[],
  ) {
    const state = this.normalizeLabel(sourceState ?? '');
    if (state.includes('absent')) return 'ABSENT' as const;
    if (state.includes('ferie')) return 'HOLIDAY' as const;
    if (
      state.includes('week end') ||
      state.includes('weekend') ||
      state.includes('repos')
    ) {
      return 'WEEKEND' as const;
    }

    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (weekday === 5 || weekday === 6) return 'WEEKEND' as const;
    if (punches.length >= 2) return 'WORKED' as const;
    return 'UNKNOWN' as const;
  }

  private parseDate(value: string | undefined) {
    const text = this.text(value).trim();
    const french = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
    if (french) {
      return `${french[3]}-${french[2].padStart(2, '0')}-${french[1].padStart(2, '0')}`;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }

  private normalizeLabel(value: string) {
    return this.text(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private text(value: unknown) {
    return value == null ? '' : String(value);
  }
}
