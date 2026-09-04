/**
 * Search normalisation and the local index.
 *
 * One module builds the index and parses the query, because two copies drift
 * and results stop being explainable. Everything here runs on-device, so search
 * works offline.
 *
 * Two mechanisms, deliberately kept apart:
 *   1. **Normalisation** — Unicode-level equivalence: ی/ي, ک/ك, hamza forms,
 *      ZWNJ, tatweel, diacritics, digits. Lossless in meaning.
 *   2. **Colloquial expansion** — «آسمون» → «آسمان» is a *different word*, not a
 *      normalisation, so it lives in a curated list and is reported separately.
 */

const ARABIC_TO_PERSIAN: Record<string, string> = {
  'ي': 'ی',
  'ك': 'ک',
  'ة': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
  'ؤ': 'و',
  'ئ': 'ی',
};

/** Diacritics, tatweel and the zero-width non-joiner. */
const STRIPPED = /[ً-ْـ‌‏‎]/g;

export function normalize(input: string): string {
  let out = input.trim().toLowerCase();
  out = out.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  out = out.replace(/[يكةأإآؤئ]/g, (char) => ARABIC_TO_PERSIAN[char] ?? char);
  out = out.replace(STRIPPED, '');
  out = out.replace(/\s+/g, ' ');
  return out;
}

/**
 * Curated colloquial forms. These are not normalisation: each entry is a
 * separate word a reader might type instead of the written form.
 */
const COLLOQUIAL: Record<string, string> = {
  'اسمون': 'آسمان',
  'نون': 'نان',
  'خونه': 'خانه',
  'میخوام': 'می‌خواهم',
  'چیه': 'چیست',
  'ریاضیات': 'ریاضی',
};

export interface QueryAnalysis {
  raw: string;
  normalized: string;
  /** Set when a curated colloquial form was substituted — the UI names it. */
  expandedFrom?: string;
  expandedTo?: string;
}

export function analyseQuery(raw: string): QueryAnalysis {
  const normalized = normalize(raw);
  const words = normalized.split(' ');
  const rawWords = raw.trim().split(/\s+/);

  for (let i = 0; i < words.length; i += 1) {
    const replacement = COLLOQUIAL[words[i]];
    if (replacement) {
      words[i] = normalize(replacement);
      return {
        raw,
        normalized: words.join(' '),
        // Reported as the reader wrote it and as we write it — the normalised
        // forms would be unrecognisable to them.
        expandedFrom: rawWords[i] ?? words[i],
        expandedTo: replacement,
      };
    }
  }
  return { raw, normalized };
}

export interface IndexedDoc<T> {
  item: T;
  /** Normalised haystack, built with the same function the query uses. */
  haystack: string;
}

export function buildIndex<T>(items: T[], fields: (item: T) => string[]): IndexedDoc<T>[] {
  return items.map((item) => ({ item, haystack: normalize(fields(item).join(' ')) }));
}

export function searchIndex<T>(index: IndexedDoc<T>[], query: QueryAnalysis): T[] {
  if (!query.normalized) return [];
  const terms = query.normalized.split(' ').filter(Boolean);
  return index
    .filter((doc) => terms.every((term) => doc.haystack.includes(term)))
    .map((doc) => doc.item);
}

/** Splits a string so a matching run can be marked in the result list. */
export function highlightParts(text: string, query: QueryAnalysis): { text: string; hit: boolean }[] {
  const terms = query.normalized.split(' ').filter(Boolean);
  if (!terms.length) return [{ text, hit: false }];

  const words = text.split(/(\s+)/);
  return words.map((word) => ({
    text: word,
    hit: terms.some((term) => term.length > 1 && normalize(word).includes(term)),
  }));
}
