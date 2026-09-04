import type { SeedProgress } from '@/lib/progress-store';

/**
 * Spaced review.
 *
 * Intervals are stated to the reader on the confidence options, so the
 * scheduler is legible rather than magic. Day three is the first ask, which is
 * why the summary block says so.
 */
export type Confidence = 'easy' | 'good' | 'hard' | 'again';

export const INTERVAL_DAYS: Record<Confidence, number> = {
  easy: 14,
  good: 7,
  hard: 3,
  again: 1,
};

export const FIRST_REVIEW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewItem {
  seedId: string;
  dueAt: string;
}

/** When a completed seed is next asked about. */
export function nextReviewFor(progress: SeedProgress): string | undefined {
  if (!progress.completedAt) return undefined;
  const base = progress.reviewedAt ?? progress.completedAt;
  const days = progress.reviewInterval ?? FIRST_REVIEW_DAYS;
  return new Date(new Date(base).getTime() + days * DAY_MS).toISOString();
}

export function dueItems(all: SeedProgress[], now = new Date()): ReviewItem[] {
  return all
    .map((progress) => ({ progress, dueAt: nextReviewFor(progress) }))
    .filter((entry): entry is { progress: SeedProgress; dueAt: string } => !!entry.dueAt)
    .filter((entry) => new Date(entry.dueAt).getTime() <= now.getTime())
    .map((entry) => ({ seedId: entry.progress.seedId, dueAt: entry.dueAt }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function upcomingItems(all: SeedProgress[], now = new Date()): ReviewItem[] {
  return all
    .map((progress) => ({ progress, dueAt: nextReviewFor(progress) }))
    .filter((entry): entry is { progress: SeedProgress; dueAt: string } => !!entry.dueAt)
    .filter((entry) => new Date(entry.dueAt).getTime() > now.getTime())
    .map((entry) => ({ seedId: entry.progress.seedId, dueAt: entry.dueAt }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * Weekly growth: which of the last seven days had a completion.
 *
 * Weekly with a grace day, not a daily streak — a broken streak is the most
 * common reason people leave this category, and the brief forbids shame
 * mechanics. Index 0 is six days ago, index 6 is today.
 */
export function weeklyGrowth(all: SeedProgress[], now = new Date()): boolean[] {
  const days: boolean[] = Array.from({ length: 7 }, () => false);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (const progress of all) {
    if (!progress.completedAt) continue;
    const completed = new Date(progress.completedAt);
    const day = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate()).getTime();
    const offset = Math.round((startOfToday - day) / DAY_MS);
    if (offset >= 0 && offset < 7) days[6 - offset] = true;
  }

  return days;
}

/** One missed day inside the week does not break it. */
export const GRACE_DAYS = 1;

export const growthCount = (days: boolean[]) => days.filter(Boolean).length;
