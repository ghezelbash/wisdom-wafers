import { localizeDigits } from '@/lib/format';

/**
 * Sizes in megabytes with one decimal, using the Persian decimal separator
 * (U+066B) rather than a full stop — «۶٫۴ مگابایت».
 */
export function formatMegabytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
  if (!locale.startsWith('fa')) return rounded;
  return localizeDigits(rounded, locale).replace('.', '٫');
}
