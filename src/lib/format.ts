/**
 * Numeral formatting.
 *
 * Persian digits belong in prose and UI («۶ دقیقه»); Latin digits only inside
 * LTR-isolated technical strings — error codes, versions, emails. Conversion
 * happens here, at render, never in a stored string, so a Latin digit can't
 * leak into Persian copy and a Persian digit can't leak into an identifier.
 */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Latin and Arabic-Indic digits → Persian. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    const digit = code >= 0x0660 ? code - 0x0660 : code - 48;
    return FA_DIGITS[digit];
  });
}

/** Persian and Arabic-Indic digits → Latin. Used by search normalisation. */
export function toLatinDigits(value: string | number): string {
  return String(value).replace(/[۰-۹٠-٩]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Digits in the reader's locale: Persian under `fa`, Latin everywhere else. */
export function localizeDigits(value: string | number, locale: string): string {
  return locale.startsWith('fa') ? toFaDigits(value) : toLatinDigits(value);
}
