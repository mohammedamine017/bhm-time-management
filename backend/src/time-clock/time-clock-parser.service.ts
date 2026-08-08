import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { normalizePersonName } from '../common/person-name';
import type {
  ParsedTimeClockDay,
  ParsedTimeClockEmployee,
} from './time-clock.types';

type Row = unknown[];

@Injectable()
export class TimeClockParserService {
  parse(buffer: Buffer): ParsedTimeClockEmployee[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException(
        'Le rapport doit être un fichier Excel .xls ou .xlsx valide.',
      );
    }

    const grouped = new Map<string, ParsedTimeClockEmployee>();
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });
      this.parseRows(rows, grouped);
    }

    const employees = [...grouped.values()].map((employee) => ({
      ...employee,
      days: employee.days
        .filter(
          (day, index, days) =>
            days.findIndex((candidate) => candidate.date === day.date) === index,
        )
        .sort((first, second) => first.date.localeCompare(second.date)),
      requiresReview:
        employee.requiresReview ||
        employee.days.some((day) => day.needsReview),
    }));
    if (!employees.length) {
      throw new BadRequestException(
        'Aucun employé ni pointage lisible trouvé dans le rapport.',
      );
    }
    return employees;
  }

  private parseRows(
    rows: Row[],
    grouped: Map<string, ParsedTimeClockEmployee>,
  ) {
    let columns: {
      number?: number;
      name?: number;
      date?: number;
      state?: number;
      punches: number[];
    } | null = null;
    let pendingDate: string | null = null;

    for (const row of rows) {
      const normalized = row.map((cell) => this.normalizeHeader(this.text(cell)));
      const nameColumn = normalized.findIndex((cell) =>
        ['nometprenom', 'nometprenomemploye', 'nomprenom'].includes(cell),
      );
      const punchColumns = normalized
        .map((cell, index) => ({ cell, index }))
        .filter(({ cell }) => /^(tmp|temp)\d+$/.test(cell))
        .map(({ index }) => index);
      if (nameColumn >= 0 && punchColumns.length > 0) {
        columns = {
          name: nameColumn,
          number: normalized.findIndex((cell) =>
            ['nemp', 'num', 'numero', 'matricule'].includes(cell),
          ),
          date: normalized.findIndex((cell) => cell === 'date'),
          state: normalized.findIndex((cell) => cell === 'etat'),
          punches: punchColumns,
        };
        continue;
      }

      const rowDate = this.findDate(row);
      if (!columns) {
        if (rowDate) pendingDate = rowDate;
        continue;
      }

      const fullName = this.text(row[columns.name ?? -1]);
      if (!fullName) {
        if (rowDate) pendingDate = rowDate;
        continue;
      }
      if (
        rowDate &&
        /^(sam|dim|lun|mar|mer|jeu|ven)/i.test(fullName)
      ) {
        pendingDate = rowDate;
        continue;
      }
      const date =
        (columns.date !== undefined && columns.date >= 0
          ? this.parseDate(row[columns.date])
          : null) ??
        pendingDate ??
        rowDate;
      if (!date) continue;

      const punches = this.readPunches(row, columns.punches);
      const stateLabel = this.readState(row, columns.state);
      const state = this.classifyState(stateLabel, punches.length);
      const duration = this.duration(punches);
      const normalizedName = normalizePersonName(fullName);
      if (!normalizedName) continue;
      const current = grouped.get(normalizedName) ?? {
        sourceEmployeeNumber:
          columns.number !== undefined && columns.number >= 0
            ? this.text(row[columns.number]) || null
            : null,
        sourceFullName: fullName.trim(),
        days: [],
        requiresReview: false,
      };
      const day: ParsedTimeClockDay = {
        date,
        punches,
        durationMinutes: duration.minutes,
        state,
        stateLabel,
        needsReview: duration.needsReview,
      };
      current.days.push(day);
      current.requiresReview ||= day.needsReview;
      grouped.set(normalizedName, current);
    }
  }

  private readPunches(row: Row, columns: number[]) {
    const punches: string[] = [];
    for (const column of columns) {
      const punch = this.parsePunch(row[column]);
      if (punch && !punches.includes(punch)) punches.push(punch);
    }
    return punches;
  }

  private duration(punches: string[]) {
    let minutes = 0;
    let needsReview = punches.length % 2 !== 0;
    for (let index = 0; index + 1 < punches.length; index += 2) {
      const entry = this.timeMinutes(punches[index]);
      const exit = this.timeMinutes(punches[index + 1]);
      if (exit < entry) {
        needsReview = true;
        continue;
      }
      minutes += exit - entry;
    }
    // The administration pause is paid and must be included once per worked day.
    if (minutes > 0) minutes += 30;
    return { minutes, needsReview };
  }

  private parsePunch(value: unknown) {
    const text = this.text(value).replace(/\s/g, '');
    const compact = text.match(/^(\d{2})(\d{2})(\d{2})$/);
    const regular = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const match = regular ?? compact;
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private readState(row: Row, stateColumn?: number) {
    const direct =
      stateColumn !== undefined && stateColumn >= 0
        ? this.text(row[stateColumn])
        : '';
    if (direct) return direct;
    return (
      row
        .map((cell) => this.text(cell))
        .find((cell) => /absent|week[\s-]*end|repos/i.test(cell)) ?? ''
    );
  }

  private classifyState(
    label: string,
    punchCount: number,
  ): ParsedTimeClockDay['state'] {
    if (/absent/i.test(label)) return 'ABSENT';
    if (/week[\s-]*end|repos/i.test(label)) return 'WEEKEND';
    if (punchCount > 0) return 'WORKED';
    return 'EMPTY';
  }

  private findDate(row: Row) {
    for (const cell of row) {
      const date = this.parseDate(cell);
      if (date) return date;
    }
    return null;
  }

  private parseDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const text = this.text(value);
    const french = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (french) {
      const [, day, month, year] = french;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }

  private timeMinutes(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private normalizeHeader(value: string) {
    return normalizePersonName(value).replace(/[^A-Z0-9]/g, '').toLowerCase();
  }

  private text(value: unknown) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
}
