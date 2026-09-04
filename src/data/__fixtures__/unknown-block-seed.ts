import { SEED_SCHEMA_VERSION, type Seed } from '@/models/seed';

/**
 * Content newer than this build.
 *
 * A permanent **test** fixture, and deliberately not in the production
 * catalogue: it is invalid by construction, and when a remote fetch failed it
 * was one of the things a real reader saw. It lives here so the registry's
 * named fallback stays exercised rather than assumed — see
 * `src/features/seed-player/__tests__/registry.test.tsx`.
 */
export const unknownBlockSeed: Seed = {
  id: 'seed-unknown-block',
  schemaVersion: SEED_SCHEMA_VERSION + 1,
  revision: 1,
  topicId: 'astronomy',
  title: 'نور ستاره چند سال است در راه؟',
  promise: 'فاصله را با زمان می‌سنجیم، و می‌بینیم آسمان یک آرشیو است.',
  difficulty: 'intro',
  estimatedMinutes: 8,
  lastReviewedAt: '2026-08-20T00:00:00.000Z',
  reviewedBy: 'تحریریه‌ی دانانه',
  recall: [
    {
      id: 'r1',
      prompt: 'بدون نگاه‌کردن به دانه: وقتی به ستاره‌ای دور نگاه می‌کنی، چه چیزی می‌بینی؟',
      answer: 'گذشته‌ی آن ستاره — تصویری که به‌اندازه‌ی فاصله‌اش سال‌ها در راه بوده است.',
    },
  ],
  sources: [
    {
      id: 'src-lightyear',
      title: 'Distance and look-back time',
      publisher: 'esa.int',
      year: 2022,
      era: 'ce',
      kind: 'توضیح رسمی سازمان فضایی',
      url: 'https://esa.int',
      latin: true,
    },
  ],
  blocks: [
    {
      id: 'b1',
      type: 'richText',
      heading: 'یک سال نوری، یک واحد زمان است',
      paragraphs: [
        'یک سال نوری فاصله‌ای است که نور در یک سال می‌پیماید. پس وقتی به ستاره‌ای در ۴۰۰ سال نوری نگاه می‌کنی، تصویری را می‌بینی که ۴۰۰ سال پیش راه افتاده است.',
      ],
    },
    // Deliberately unrecognised: renders the named fallback, logs the type, and
    // never blocks the rest of the seed.
    { id: 'b2', type: 'starMap3d' },
    {
      id: 'b3',
      type: 'summary',
      points: [
        'یک سال نوری واحد فاصله است، اما با زمان بیان می‌شود.',
        'هر نگاه به آسمان، نگاهی به گذشته است.',
        'دورترین چیزی که می‌بینیم، مرز زمانی دید ماست نه مرز جهان.',
      ],
    },
  ],
};
