import { parseTimeSheetDayValue } from './time-sheet-day-value';

describe('parseTimeSheetDayValue', () => {
  it.each(['A', '0', 'X', 'STC', 'MU', 'RC', 'CP', 'MA'])(
    'accepts the work code %s',
    (code) => {
      expect(parseTimeSheetDayValue(code.toLowerCase())).toEqual({
        normalized: code,
        supported: true,
        hours: null,
        displacement: false,
        holiday: false,
      });
    },
  );

  it('keeps worked hours with displacement', () => {
    expect(parseTimeSheetDayValue('8,5 d')).toEqual({
      normalized: '8.5D',
      supported: true,
      hours: 8.5,
      displacement: true,
      holiday: false,
    });
  });

  it.each([
    ['8D', '8D'],
    ['D8', '8D'],
    ['8 d', '8D'],
    ['d 8', '8D'],
  ])('normalizes displacement value %s to %s', (value, normalized) => {
    expect(parseTimeSheetDayValue(value)).toEqual({
      normalized,
      supported: true,
      hours: 8,
      displacement: true,
      holiday: false,
    });
  });

  it.each([
    ['8F', '8F'],
    ['F8', '8F'],
    ['8 f', '8F'],
    ['f 8', '8F'],
  ])('normalizes holiday value %s to %s', (value, normalized) => {
    expect(parseTimeSheetDayValue(value)).toEqual({
      normalized,
      supported: true,
      hours: 8,
      displacement: false,
      holiday: true,
    });
  });

  it('keeps F alone as a holiday without worked hours', () => {
    expect(parseTimeSheetDayValue('F')).toEqual({
      normalized: 'F',
      supported: true,
      hours: null,
      displacement: false,
      holiday: true,
    });
  });

  it('rejects D alone', () => {
    expect(parseTimeSheetDayValue('D').supported).toBe(false);
  });

  it('rejects the removed P code', () => {
    expect(parseTimeSheetDayValue('P').supported).toBe(false);
  });
});
