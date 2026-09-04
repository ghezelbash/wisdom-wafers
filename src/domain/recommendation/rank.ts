import type { Seed } from '@/models/seed';

/**
 * Ranking v1 — deterministic and explainable (blueprint §9.3).
 *
 * Every weight is visible, every card can say why it is there, and the same
 * inputs always produce the same order. That is the point: a feed nobody can
 * explain cannot be debugged, and a reason invented after the fact is worse
 * than no reason at all.
 */

export const WEIGHTS = {
  interestAffinity: 0.3,
  continuation: 0.18,
  reviewDue: 0.15,
  formatFit: 0.12,
  difficultyFit: 0.1,
  freshness: 0.08,
  editorialQuality: 0.07,
} as const;

export const REPETITION_PENALTY = 0.4;
export const SATURATION_PENALTY = 0.12;

/** At least this share of the feed is not what the model would pick. */
export const EXPLORATION_FLOOR = 0.15;

export type ReasonCode = 'interest' | 'continuation' | 'review' | 'short' | 'fresh' | 'explore';

export interface RankerSignals {
  /** Topic ids the reader chose. */
  interests: string[];
  /** Seed ids started and not finished. */
  inProgress: string[];
  /** Seed ids with a review due. */
  reviewDue: string[];
  /** Seed ids already completed. */
  completed: string[];
  /** Minutes the reader said they have. */
  paceMinutes: number;
  /** Difficulty they have been doing well at. */
  preferredDifficulty: Seed['difficulty'];
  /** ISO timestamp used for freshness. */
  now: string;
  /** Locale the app is showing. */
  locale: string;
  /** Seeds this build cannot render at all. */
  blocked?: string[];
}

export interface RankedSeed {
  seed: Seed;
  score: number;
  reason?: ReasonCode;
  /** Component contributions, kept for tests and for a debug view. */
  parts: Record<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard filters run before scoring.
 *
 * These are correctness, not preference: a seed that cannot be rendered or is
 * not published must never appear, however well it would score.
 */
export function isEligible(seed: Seed, signals: RankerSignals): boolean {
  if (signals.blocked?.includes(seed.id)) return false;
  if (seed.blocks.length === 0) return false;
  return true;
}

function freshness(seed: Seed, now: string): number {
  const age = (new Date(now).getTime() - new Date(seed.lastReviewedAt).getTime()) / DAY_MS;
  if (Number.isNaN(age)) return 0;
  // Full marks for the last month, tailing off over a year.
  return Math.max(0, Math.min(1, 1 - Math.max(0, age - 30) / 335));
}

function difficultyFit(seed: Seed, preferred: Seed['difficulty']): number {
  const order = ['intro', 'medium', 'advanced'];
  const distance = Math.abs(order.indexOf(seed.difficulty) - order.indexOf(preferred));
  return distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
}

export function scoreSeed(seed: Seed, signals: RankerSignals): RankedSeed {
  const parts: Record<string, number> = {
    interestAffinity: signals.interests.includes(seed.topicId) ? WEIGHTS.interestAffinity : 0,
    continuation: signals.inProgress.includes(seed.id) ? WEIGHTS.continuation : 0,
    reviewDue: signals.reviewDue.includes(seed.id) ? WEIGHTS.reviewDue : 0,
    formatFit: seed.estimatedMinutes <= signals.paceMinutes ? WEIGHTS.formatFit : 0,
    difficultyFit: difficultyFit(seed, signals.preferredDifficulty) * WEIGHTS.difficultyFit,
    freshness: freshness(seed, signals.now) * WEIGHTS.freshness,
    editorialQuality: (seed.sources.length > 0 ? 1 : 0) * WEIGHTS.editorialQuality,
    // Something already finished is not a recommendation.
    repetition: signals.completed.includes(seed.id) ? -REPETITION_PENALTY : 0,
  };

  const score = Object.values(parts).reduce((total, value) => total + value, 0);

  return { seed, score, reason: reasonFor(parts), parts };
}

/**
 * The reason a card carries.
 *
 * Derived from the component that actually moved the score, so it is true by
 * construction. If nothing dominated, the card shows no reason — never a
 * plausible-sounding guess.
 */
function reasonFor(parts: Record<string, number>): ReasonCode | undefined {
  const ranked = Object.entries(parts)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  const top = ranked[0]?.[0];
  switch (top) {
    case 'interestAffinity':
      return 'interest';
    case 'continuation':
      return 'continuation';
    case 'reviewDue':
      return 'review';
    case 'formatFit':
      return 'short';
    case 'freshness':
      return 'fresh';
    default:
      return undefined;
  }
}

/**
 * Ranks a candidate set, then spends the last slots on exploration.
 *
 * Saturation is applied as the list is built rather than afterwards: three
 * seeds from one topic in a row is a worse feed than a slightly lower total
 * score, and the reader notices the repetition long before they notice the
 * relevance.
 */
export function rankSeeds(
  candidates: Seed[],
  signals: RankerSignals,
  limit = 10
): RankedSeed[] {
  const eligible = candidates.filter((seed) => isEligible(seed, signals));
  const scored = eligible
    .map((seed) => scoreSeed(seed, signals))
    // Ties break by id so the order is stable across renders.
    .sort((a, b) => b.score - a.score || a.seed.id.localeCompare(b.seed.id));

  // Exploration is a reservation, not a leftover: topics the reader did not
  // choose get room even when everything they did choose scores higher.
  const exploreSlots = Math.min(
    Math.max(1, Math.round(limit * EXPLORATION_FLOOR)),
    scored.filter((item) => !signals.interests.includes(item.seed.topicId)).length
  );

  const mainSlots = Math.max(0, limit - exploreSlots);
  const picked: RankedSeed[] = [];
  const perTopic = new Map<string, number>();

  for (const candidate of scored) {
    if (picked.length >= mainSlots) break;

    // Saturation is applied as the list is built: three seeds from one topic in
    // a row is a worse feed than a slightly lower total score, and repetition
    // is noticed long before relevance is.
    const seen = perTopic.get(candidate.seed.topicId) ?? 0;
    const adjusted = candidate.score - seen * SATURATION_PENALTY;

    picked.push({ ...candidate, score: adjusted });
    perTopic.set(candidate.seed.topicId, seen + 1);
  }

  const chosen = new Set(picked.map((item) => item.seed.id));

  const explore = scored
    .filter((item) => !chosen.has(item.seed.id) && !signals.interests.includes(item.seed.topicId))
    .slice(0, exploreSlots)
    .map((item) => ({ ...item, reason: 'explore' as ReasonCode }));

  // If there were not enough unfamiliar topics to fill the reservation, the
  // remaining slots go back to the ranking rather than being left empty.
  const filler = scored
    .filter((item) => !chosen.has(item.seed.id) && !explore.some((e) => e.seed.id === item.seed.id))
    .slice(0, Math.max(0, limit - picked.length - explore.length));

  return [...picked, ...explore, ...filler];
}
