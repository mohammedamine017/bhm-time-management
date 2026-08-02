const SIMPLE_CODES = new Set([
  '0',
  'P',
  'A',
  'T',
  'F',
  'X',
  'STC',
  'MU',
  'RC',
  'CP',
  'MA',
]);
const HOURS_FIRST_PATTERN = /^(\d{1,2}(?:\.\d{1,2})?)([DF])?$/;
const CODE_FIRST_PATTERN = /^([DF])(\d{1,2}(?:\.\d{1,2})?)$/;

export interface ParsedTimeSheetDayValue {
  normalized: string;
  supported: boolean;
  hours: number | null;
  displacement: boolean;
  holiday: boolean;
}

export function parseTimeSheetDayValue(value: string): ParsedTimeSheetDayValue {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) {
    return {
      normalized: '',
      supported: true,
      hours: null,
      displacement: false,
      holiday: false,
    };
  }
  if (SIMPLE_CODES.has(normalized)) {
    return {
      normalized,
      supported: true,
      hours: null,
      displacement: false,
      holiday: normalized === 'F',
    };
  }

  const hoursFirstMatch = normalized.match(HOURS_FIRST_PATTERN);
  const codeFirstMatch = normalized.match(CODE_FIRST_PATTERN);
  const hoursText = hoursFirstMatch?.[1] ?? codeFirstMatch?.[2];
  const code = hoursFirstMatch?.[2] ?? codeFirstMatch?.[1] ?? '';
  const hours = hoursText ? Number(hoursText) : Number.NaN;
  if (!hoursText || hours > 24) {
    return {
      normalized,
      supported: false,
      hours: null,
      displacement: false,
      holiday: false,
    };
  }

  return {
    normalized: `${hours}${code}`,
    supported: true,
    hours,
    displacement: code === 'D',
    holiday: code === 'F',
  };
}
