import { EVENT_NAMES } from './events';

/**
 * Where each declared event is actually sent from.
 *
 * Nine of the sixteen declared events had no runtime call at all: impressions,
 * downloads, reviews, notifications and the account link were a taxonomy with
 * nothing behind it, so any dashboard built on them would have shown a
 * confident zero. This turns "is it wired?" into something a test can answer,
 * by reading the source rather than by trusting a list someone maintained.
 *
 * The scan is deliberately literal — `track('name'` — because that is exactly
 * the shape the typed `track` helper forces at a call site. A name assembled
 * from a variable would not be found, and should not be: it would defeat the
 * declared taxonomy too.
 */

export interface CoverageEntry {
  event: string;
  /** Paths, relative to the repository root, that send it. */
  sites: string[];
}

const CALL = (event: string) => new RegExp(`track\\(\\s*['"\`]${event}['"\`]`);

export interface SourceFile {
  path: string;
  text: string;
}

export function coverageFrom(files: SourceFile[]): CoverageEntry[] {
  return EVENT_NAMES.map((event) => ({
    event,
    sites: files
      .filter((file) => CALL(event).test(file.text))
      .map((file) => file.path)
      .sort(),
  }));
}

export const uncovered = (coverage: CoverageEntry[]): string[] =>
  coverage.filter((entry) => entry.sites.length === 0).map((entry) => entry.event);
