/**
 * Outbox retry policy.
 *
 * Exponential backoff with jitter, a ceiling, and a dead letter after that —
 * an item that can never succeed must stop consuming battery and network, but
 * it is kept so the failure is visible rather than silently discarded.
 */
export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 6 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 8;

export function backoffMs(attempts: number, random = Math.random): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
  // Full jitter: without it every device that went offline together comes back
  // in the same second.
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export function nextAttemptAt(attempts: number, now: Date, random = Math.random): string {
  return new Date(now.getTime() + backoffMs(attempts, random)).toISOString();
}

export const isDead = (attempts: number) => attempts >= MAX_ATTEMPTS;
