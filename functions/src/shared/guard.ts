import { FieldValue } from 'firebase-admin/firestore';

import type { Deps } from './deps';

/**
 * What a public callable will accept before it starts doing work.
 *
 * Every callable validated its *contents* and none of them validated its
 * *size*: a single request carrying a fifty-megabyte array of well-formed
 * events passed straight into a Firestore batch, and one signed-in account
 * could call any endpoint as fast as it could open sockets. The batch caps that
 * existed (200 / 50 / 100) were written inline at three call sites, which is how
 * they came to disagree with each other.
 *
 * So the ceilings live in one table, and the checks run in one place, before
 * the handler.
 *
 * ### The rate limit must not cost a reader their data
 *
 * The outbox dead-letters an item after `MAX_ATTEMPTS` failures. If being
 * throttled counted as a failure, a device that hit the limit eight times would
 * *delete a reader's completed seed* — the queue would have been told the send
 * failed, when in fact the server asked it to wait. `rate-limited` is therefore
 * raised as its own code, mapped to `resource-exhausted`, and the client defers
 * the item instead of failing it. See ADR 0022.
 *
 * ### App Check
 *
 * Not enforced. Enforcing it now would lock out every build already installed,
 * and there is no data yet on how many requests would be refused. Each call
 * records whether a verified App Check token was present, so the rollout is a
 * decision with a number behind it rather than a guess. `enforceAppCheck` stays
 * false in `index.ts` until that number says otherwise.
 */

export type GuardCode = 'payload-too-large' | 'too-many-items' | 'rate-limited';

export class GuardError extends Error {
  constructor(
    readonly code: GuardCode,
    /** Present on `rate-limited`: how long until the window rolls over. */
    readonly retryAfterSeconds?: number
  ) {
    super(code);
    this.name = 'GuardError';
  }
}

export interface CallableLimits {
  /** Longest request body, in bytes of JSON. */
  maxBytes: number;
  /** Most items in one batch, where the callable takes a batch. */
  maxItems: number;
  /** Calls allowed per window, per caller. */
  perWindow: number;
  windowSeconds: number;
}

/**
 * The ceilings, per callable.
 *
 * Set from what an honest client does, with room: the outbox flushes in batches
 * and backs off, so a device sending sixty progress batches a minute is already
 * far outside normal use. Staff endpoints carry a large body limit because a
 * seed with its blocks is the payload, and a small call limit because a person
 * is pressing a button.
 */
export const LIMITS: Record<string, CallableLimits> = {
  ingestProgress: { maxBytes: 512 * 1024, maxItems: 200, perWindow: 60, windowSeconds: 60 },
  submitReport: { maxBytes: 128 * 1024, maxItems: 50, perWindow: 10, windowSeconds: 60 },
  recordTelemetryBatch: { maxBytes: 256 * 1024, maxItems: 100, perWindow: 60, windowSeconds: 60 },

  // Deleting an account is once in a lifetime. The tight limit is what makes
  // guessing a receipt impractical on the endpoints that take no session.
  beginDeleteMyAccount: { maxBytes: 4 * 1024, maxItems: 1, perWindow: 5, windowSeconds: 60 },
  deleteMyAccount: { maxBytes: 4 * 1024, maxItems: 1, perWindow: 5, windowSeconds: 60 },
  resumeDeleteMyAccount: { maxBytes: 4 * 1024, maxItems: 1, perWindow: 10, windowSeconds: 60 },
  myAccountDeletionStatus: { maxBytes: 4 * 1024, maxItems: 1, perWindow: 20, windowSeconds: 60 },

  // Staff: a whole seed is the body.
  publish: { maxBytes: 2 * 1024 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  createContentDraft: { maxBytes: 2 * 1024 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  startCorrection: { maxBytes: 8 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  submitForReview: { maxBytes: 8 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  review: { maxBytes: 16 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  publishApproved: { maxBytes: 8 * 1024, maxItems: 1, perWindow: 30, windowSeconds: 60 },
  rollback: { maxBytes: 8 * 1024, maxItems: 1, perWindow: 10, windowSeconds: 60 },
};

/** A callable with no entry gets the strictest sensible default, never none. */
const FALLBACK: CallableLimits = {
  maxBytes: 16 * 1024,
  maxItems: 1,
  perWindow: 10,
  windowSeconds: 60,
};

export const limitsFor = (name: string): CallableLimits => LIMITS[name] ?? FALLBACK;

/** Bytes on the wire, not UTF-16 units: a Persian payload is mostly 2-byte. */
export function payloadBytes(data: unknown): number {
  if (data === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(data) ?? '', 'utf8');
  } catch {
    // Circular or otherwise unserialisable: it was never a valid request body.
    return Number.POSITIVE_INFINITY;
  }
}

export function assertPayload(name: string, data: unknown): void {
  if (payloadBytes(data) > limitsFor(name).maxBytes) {
    throw new GuardError('payload-too-large');
  }
}

export function assertBatch(name: string, count: number): void {
  if (count > limitsFor(name).maxItems) throw new GuardError('too-many-items');
}

const windowStart = (now: Date, windowSeconds: number) =>
  Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000;

/**
 * A fixed-window counter, one document per caller per callable.
 *
 * Fixed rather than sliding on purpose: a sliding window needs the timestamps
 * of every call in it, and the burst a fixed window permits at a boundary is
 * bounded by twice the limit — which for these numbers is still nothing.
 *
 * The document is written in a transaction because two of a caller's requests
 * can land at once, and a read-then-write would let both through.
 */
export async function assertRateLimit(
  deps: Deps,
  options: { name: string; key: string }
): Promise<{ remaining: number }> {
  const limits = limitsFor(options.name);
  const now = deps.now();
  const startedAt = windowStart(now, limits.windowSeconds);
  const reference = deps.db.doc(`rateLimits/${options.name}__${encodeURIComponent(options.key)}`);

  const outcome = await deps.db.runTransaction(async (transaction) => {
    const current = (await transaction.get(reference)).data() as
      | { windowStartedAt?: number; count?: number }
      | undefined;

    const inWindow = current?.windowStartedAt === startedAt;
    const count = (inWindow ? (current?.count ?? 0) : 0) + 1;

    if (count > limits.perWindow) {
      const resetsAt = startedAt + limits.windowSeconds * 1000;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now.getTime()) / 1000)),
        remaining: 0,
      };
    }

    transaction.set(reference, {
      windowStartedAt: startedAt,
      count,
      // Lets a scheduled sweep drop documents nobody is counting any more.
      expiresAt: new Date(startedAt + limits.windowSeconds * 2000).toISOString(),
    });
    return { allowed: true, remaining: limits.perWindow - count, retryAfterSeconds: 0 };
  });

  if (!outcome.allowed) throw new GuardError('rate-limited', outcome.retryAfterSeconds);
  return { remaining: outcome.remaining };
}

/** Ten shards: enough that a daily counter is not a single contended document. */
export const APP_CHECK_SHARDS = 10;

export const appCheckDay = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Counts how many calls arrive with a verified App Check token.
 *
 * This is the evidence for the enforcement decision, and it is why enforcement
 * is not on yet: turning it on blind would refuse every request from a build
 * that predates the change, and nothing would say how many that is.
 *
 * Fire and forget — a metric must never be the reason a reader's completion
 * fails to record.
 */
export async function recordAppCheckCoverage(
  deps: Deps,
  options: { name: string; verified: boolean }
): Promise<void> {
  const shard = Math.floor(Math.random() * APP_CHECK_SHARDS);
  const field = options.verified ? 'verified' : 'unverified';

  try {
    await deps.db
      .doc(`appCheckCoverage/${appCheckDay(deps.now())}/shards/${shard}`)
      .set(
        {
          [field]: FieldValue.increment(1),
          [`byCallable.${options.name}.${field}`]: FieldValue.increment(1),
        },
        { merge: true }
      );
  } catch {
    // Deliberately swallowed: see above.
  }
}

/** Sums the shards for a day. Used by the rollout report, and by its test. */
export async function appCheckCoverageFor(
  deps: Deps,
  day: string
): Promise<{ verified: number; unverified: number; ratio: number }> {
  const snapshot = await deps.db.collection(`appCheckCoverage/${day}/shards`).get();

  let verified = 0;
  let unverified = 0;
  for (const document of snapshot.docs) {
    verified += (document.data().verified as number) ?? 0;
    unverified += (document.data().unverified as number) ?? 0;
  }

  const total = verified + unverified;
  return { verified, unverified, ratio: total === 0 ? 0 : verified / total };
}

export interface GuardOptions {
  name: string;
  /** Who is being counted: a uid, or for a session-less call, the uid claimed. */
  key: string;
  data: unknown;
  /** Number of items in the batch, when the callable takes one. */
  items?: number;
  /** Whether the request carried a verified App Check token. */
  appCheckVerified: boolean;
}

/**
 * Everything a public callable checks before it does anything.
 *
 * Order matters: the two free checks come first, so a caller flooding oversized
 * requests is refused without a Firestore transaction per attempt.
 */
export async function guard(deps: Deps, options: GuardOptions): Promise<void> {
  assertPayload(options.name, options.data);
  if (options.items !== undefined) assertBatch(options.name, options.items);
  await assertRateLimit(deps, { name: options.name, key: options.key });

  void recordAppCheckCoverage(deps, {
    name: options.name,
    verified: options.appCheckVerified,
  });
}
