/**
 * The event taxonomy (blueprint §11.1).
 *
 * Every event is declared here with its parameters, so a name is not invented
 * at a call site and a dashboard query cannot silently stop matching. Adding an
 * event is a change to this file and its test — deliberately a review-sized
 * step.
 */

export interface EventMap {
  onboarding_started: { locale: string };
  onboarding_completed: { topic_count: number; pace: string; duration_ms: number };
  seed_impression: {
    seed_id: string;
    revision: number;
    placement: 'home_hero' | 'home_rail' | 'search' | 'topic' | 'path' | 'garden';
    rank: number;
    reason_code?: string;
  };
  seed_started: { seed_id: string; revision: number; source: string; online: boolean };
  block_completed: { seed_id: string; block_type: string; ordinal: number };
  answer_submitted: {
    seed_id: string;
    block_type: string;
    correct: boolean;
    partial: boolean;
    attempt_no: number;
  };
  seed_completed: { seed_id: string; duration_ms: number; interaction_count: number };
  review_completed: { item_count: number; correct_count: number; interval_days: number };
  search_performed: { normalized_length: number; result_count: number; filter_count: number };
  download_started: { seed_id: string; bytes: number; online: boolean };
  download_failed: { seed_id: string; error_code: string };
  download_completed: { seed_id: string; bytes: number };
  notification_permission: { state: string };
  notification_opened: { route: string };
  content_reported: { seed_id: string; category: string };
  account_linked: { from: 'anonymous' | 'local' };
}

export type EventName = keyof EventMap;

/**
 * Parameter names that must never carry free text.
 *
 * Search terms, reflections, titles and email addresses are the four ways
 * personal or sensitive content leaks into analytics; the guard below refuses
 * them rather than trusting every future call site to remember.
 */
const FORBIDDEN_KEY = /(email|name|query|text|title|reflection|answer_text|token|phone|address)/i;

/** Anything that looks like an address, a URL, or a long free-text run. */
const LOOKS_PERSONAL = /@|https?:\/\/|\s\S+\s\S+\s\S+\s/;

export interface ValidationIssue {
  key: string;
  reason: 'forbidden-key' | 'looks-personal' | 'unsupported-type';
}

/**
 * Rejects parameters that could carry PII before anything is sent.
 *
 * The rule is structural, not a judgement call at the call site: numbers,
 * booleans and short identifiers are fine; anything else has to be turned into
 * a category or a length first.
 */
export function validateParams(params: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (FORBIDDEN_KEY.test(key)) {
      issues.push({ key, reason: 'forbidden-key' });
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') continue;

    if (typeof value !== 'string') {
      issues.push({ key, reason: 'unsupported-type' });
      continue;
    }

    if (LOOKS_PERSONAL.test(value) || value.length > 64) {
      issues.push({ key, reason: 'looks-personal' });
    }
  }

  return issues;
}
