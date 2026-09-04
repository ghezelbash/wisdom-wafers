import { addDays, formatLongDate, formatNumericDate, formatSourceYear } from '@/lib/date';
import { toFaDigits, toLatinDigits, localizeDigits } from '@/lib/format';
import { JALALI_MONTHS, toJalali } from '@/lib/jalali';

const noon = (iso: string) => `${iso}T12:00:00.000Z`;

describe('toJalali', () => {
  it('matches the dates printed in the design handoff', () => {
    // «آخرین بازبینی ۱۴۰۵/۰۵/۲۹» on the sources sheet.
    expect(toJalali(new Date(noon('2026-08-20')))).toEqual({ year: 1405, month: 5, day: 29 });
    // «مرور بعدی ۱۴۰۵/۰۶/۰۱» on the completion screen.
    expect(toJalali(new Date(noon('2026-08-23')))).toEqual({ year: 1405, month: 6, day: 1 });
  });

  it('puts Nowruz on the first of Farvardin', () => {
    expect(toJalali(new Date(noon('2026-03-21')))).toEqual({ year: 1405, month: 1, day: 1 });
    expect(toJalali(new Date(noon('2000-03-20')))).toEqual({ year: 1379, month: 1, day: 1 });
  });

  it('never skips or repeats a day across a year boundary', () => {
    let cursor = new Date(noon('2026-03-15'));
    let previous = toJalali(cursor);

    for (let i = 0; i < 400; i += 1) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      const current = toJalali(cursor);
      const rolledDay = current.day === previous.day + 1 && current.month === previous.month;
      const rolledMonth = current.day === 1 && current.month === previous.month + 1;
      const rolledYear = current.day === 1 && current.month === 1 && current.year === previous.year + 1;
      expect(rolledDay || rolledMonth || rolledYear).toBe(true);
      previous = current;
    }
  });

  it('keeps the first six months at 31 days', () => {
    expect(toJalali(new Date(noon('2026-04-20')))).toEqual({ year: 1405, month: 1, day: 31 });
    expect(toJalali(new Date(noon('2026-04-21')))).toEqual({ year: 1405, month: 2, day: 1 });
  });

  it('names the months in order', () => {
    expect(JALALI_MONTHS[0]).toBe('فروردین');
    expect(JALALI_MONTHS[11]).toBe('اسفند');
    expect(JALALI_MONTHS).toHaveLength(12);
  });
});

describe('date formatting', () => {
  it('renders Jalali with Persian digits under fa', () => {
    expect(formatNumericDate(noon('2026-08-20'), 'fa')).toBe('۱۴۰۵/۰۵/۲۹');
  });

  it('renders Gregorian with Latin digits under en', () => {
    expect(formatNumericDate(noon('2026-08-20'), 'en')).toBe('2026-08-20');
  });

  it('writes a long date the way Home does', () => {
    expect(formatLongDate(noon('2026-08-20'), 'fa')).toContain('مرداد');
    expect(formatLongDate(noon('2026-08-20'), 'en')).toContain('August');
  });

  it('carries an era marker on a source year', () => {
    expect(formatSourceYear(1987, 'ce', 'fa')).toBe('۱۹۸۷ م.');
    expect(formatSourceYear(1398, 'sh', 'fa')).toBe('۱۳۹۸ ش.');
    expect(formatSourceYear(1987, 'ce', 'en')).toBe('1987');
  });

  it('adds days without drifting the time of day', () => {
    expect(addDays(noon('2026-08-20'), 3)).toBe(noon('2026-08-23'));
  });
});

describe('digits', () => {
  it('converts Latin and Arabic-Indic digits to Persian', () => {
    expect(toFaDigits('2026')).toBe('۲۰۲۶');
    expect(toFaDigits('١٤٠٥')).toBe('۱۴۰۵');
    expect(toFaDigits(6)).toBe('۶');
  });

  it('converts back for technical strings', () => {
    expect(toLatinDigits('۱۴۰۵')).toBe('1405');
    expect(toLatinDigits('١٤٠٥')).toBe('1405');
  });

  it('leaves non-digits alone, including the separator', () => {
    expect(toFaDigits('۶٫۴ مگابایت')).toBe('۶٫۴ مگابایت');
    expect(toFaDigits('21:00')).toBe('۲۱:۰۰');
  });

  it('follows the locale', () => {
    expect(localizeDigits(7, 'fa')).toBe('۷');
    expect(localizeDigits(7, 'en')).toBe('7');
    expect(localizeDigits('۱۴', 'en')).toBe('14');
  });
});
