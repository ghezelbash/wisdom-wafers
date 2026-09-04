import { JALALI_MONTHS, JALALI_WEEKDAYS, toJalali } from '@/lib/jalali';
import { toFaDigits } from '@/lib/format';

const pad = (value: number) => String(value).padStart(2, '0');

/** «۱۴۰۵/۰۵/۲۹» under fa, ISO-style under en. */
export function formatNumericDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (!locale.startsWith('fa')) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const { year, month, day } = toJalali(date);
  return toFaDigits(`${year}/${pad(month)}/${pad(day)}`);
}

/** «پنجشنبه ۲۹ مرداد» under fa. */
export function formatLongDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (!locale.startsWith('fa')) {
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const { month, day } = toJalali(date);
  return `${JALALI_WEEKDAYS[date.getDay()]} ${toFaDigits(day)} ${JALALI_MONTHS[month - 1]}`;
}

/** A publication year with its era marker: «۱۹۸۷ م.» / «۱۳۹۸ ش.». */
export function formatSourceYear(year: number, era: 'ce' | 'sh', locale: string): string {
  if (!locale.startsWith('fa')) return String(year);
  return `${toFaDigits(year)} ${era === 'ce' ? 'م.' : 'ش.'}`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
