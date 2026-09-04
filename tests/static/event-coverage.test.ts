import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { coverageFrom, uncovered, type SourceFile } from '../../src/platform/analytics/coverage';
import { EVENT_NAMES } from '../../src/platform/analytics/events';

/**
 * An event that is declared and never sent.
 *
 * Nine of the sixteen were in exactly that state: impressions, all three
 * download events, review completion, both notification events and the account
 * link. A dashboard built on any of them would have shown zero — not "no data",
 * but a confident, wrong number that a release decision could rest on.
 *
 * So the taxonomy is checked against the source, and the check is the reason
 * the next event cannot be added and forgotten.
 */

const ROOT = join(__dirname, '../..');
const SKIP = new Set(['__tests__', '__fixtures__', 'node_modules']);

function sourceFiles(dir = join(ROOT, 'src'), found: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry)) {
      found.push({ path: full.slice(ROOT.length + 1), text: readFileSync(full, 'utf8') });
    }
  }
  return found;
}

const files = sourceFiles().filter((file) => !file.path.endsWith('analytics/coverage.ts'));
const coverage = coverageFrom(files);

describe('the declared taxonomy', () => {
  it('is entirely wired — every event has a real call site', () => {
    expect(uncovered(coverage)).toEqual([]);
  });

  it('covers all sixteen MVP events', () => {
    expect(coverage).toHaveLength(EVENT_NAMES.length);
    expect(EVENT_NAMES).toHaveLength(16);
  });

  /** The funnel the release decision is read from, named event by event. */
  it.each([
    ['onboarding_started', 'src/app/onboarding/index.tsx'],
    ['onboarding_completed', 'src/app/onboarding/first-seed.tsx'],
    ['seed_impression', 'src/platform/analytics/impression.ts'],
    ['seed_started', 'src/app/seed/[id]/index.tsx'],
    ['seed_completed', 'src/app/seed/[id]/index.tsx'],
    ['download_started', 'src/context/CatalogContext.tsx'],
    ['download_completed', 'src/context/CatalogContext.tsx'],
    ['download_failed', 'src/context/CatalogContext.tsx'],
    ['review_completed', 'src/app/review/session.tsx'],
    ['notification_permission', 'src/platform/notifications.ts'],
    ['notification_opened', 'src/hooks/use-notification-routing.ts'],
    ['account_linked', 'src/context/AuthContext.tsx'],
    ['content_reported', 'src/features/seed-player/sheets/report-sheet.tsx'],
  ])('sends %s from %s', (event, site) => {
    expect(coverage.find((entry) => entry.event === event)?.sites).toContain(site);
  });
});

describe('the coverage table that is offered as evidence', () => {
  const document = readFileSync(join(ROOT, 'docs/event-coverage.md'), 'utf8');

  /** Evidence maintained by hand stops being evidence. */
  it('names every event and the file that sends it', () => {
    for (const entry of coverage) {
      expect(document).toContain(`\`${entry.event}\``);
      for (const site of entry.sites) expect(document).toContain(`\`${site}\``);
    }
  });

  it('says what the impression number actually measures', () => {
    // The bias is documented rather than left to be discovered from a ratio
    // that never quite makes sense.
    expect(document).toContain('upper bound');
  });
});
