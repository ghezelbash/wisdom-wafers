import { ProgressEventSchema, type ProgressEvent } from '@dananeh/content-schema';

import { enqueue } from '@/lib/outbox';
import { appVersion } from '@/platform/app-info';

/**
 * Everything the device tells the server about what a reader did.
 *
 * The envelope is built here, once, and validated against the same schema the
 * ingest Function parses with. A screen used to enqueue
 * `{seedId, revision, completedAt}` — which the server rejected, and which the
 * old queue then deleted as if it had been delivered. Building the envelope in
 * one place, and refusing to queue one that does not parse, is what makes that
 * failure impossible rather than unlikely.
 */

export type ReportCategory =
  | 'factual'
  | 'sources'
  | 'language'
  | 'inappropriate'
  | 'technical';

export interface ContentReport {
  id: string;
  uid: string;
  seedId: string;
  revision: number;
  blockId?: string;
  category: ReportCategory;
  /** The reader's own words. Optional, and capped by the rules and the schema. */
  detail?: string;
  occurredAtDevice: string;
  appVersion: string;
}

/**
 * A random, collision-resistant idempotency key.
 *
 * The server deduplicates on it, so it must not be derived from anything that
 * could repeat — including a timestamp, which two events in the same
 * millisecond would share.
 */
export function eventId(random = Math.random): string {
  const chunk = () => Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${chunk()}${chunk()}${chunk()}`;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export class InvalidEventError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(`progress event failed validation: ${issues.map((i) => i.path).join(', ')}`);
    this.name = 'InvalidEventError';
  }
}

export interface EventInput {
  uid: string;
  seedId: string;
  revision: number;
  type: ProgressEvent['type'];
  blockId?: string;
  /** The reader's position, so another device can resume where this one is. */
  blockIndex?: number;
  answer?: string | number | boolean | string[];
  correct?: boolean;
  confidence?: ProgressEvent['confidence'];
  occurredAt?: string;
}

/** Builds a complete event, or throws — never a half-filled one. */
export function progressEvent(input: EventInput, id = eventId()): ProgressEvent {
  const candidate = {
    id,
    uid: input.uid,
    seedId: input.seedId,
    revision: input.revision,
    type: input.type,
    ...(input.blockId ? { blockId: input.blockId } : {}),
    ...(input.blockIndex !== undefined ? { blockIndex: input.blockIndex } : {}),
    ...(input.answer !== undefined ? { answer: input.answer } : {}),
    ...(input.correct !== undefined ? { correct: input.correct } : {}),
    ...(input.confidence ? { confidence: input.confidence } : {}),
    occurredAtDevice: input.occurredAt ?? new Date().toISOString(),
    // The reader's own calendar, so a completion at 00:30 in Tehran counts for
    // that day wherever the function runs.
    timezone: deviceTimezone(),
    appVersion: appVersion(),
  };

  const parsed = ProgressEventSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidEventError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }))
    );
  }
  return parsed.data;
}

/**
 * Queues one progress event. Reflections are never among them.
 *
 * `id` is accepted so a backfill can use a deterministic one — re-announcing
 * the same completion must be a duplicate the server discards, not a second
 * completion.
 */
export async function recordProgressEvent(
  input: EventInput,
  id?: string
): Promise<ProgressEvent> {
  const event = progressEvent(input, id ?? eventId());
  await enqueue('progress-event', event.id, event as unknown as Record<string, unknown>);
  return event;
}

export const recordCompletion = (input: Omit<EventInput, 'type'>) =>
  recordProgressEvent({ ...input, type: 'completed' });

export const recordReviewed = (input: Omit<EventInput, 'type'>) =>
  recordProgressEvent({ ...input, type: 'reviewed' });

/**
 * The reader reached a block they had not reached before.
 *
 * Queued once per furthest position rather than on every navigation — moving
 * back and forth within a seed is normal and says nothing new about where they
 * got to. Bounded by the number of blocks in a seed.
 */
export const recordPosition = (input: Omit<EventInput, 'type'> & { blockIndex: number }) =>
  recordProgressEvent({ ...input, type: 'block_viewed' });

/**
 * Queues a content report.
 *
 * It goes through the outbox like everything else: a reader who spots a wrong
 * fact on a plane should not have to remember to say so again on landing.
 */
export async function recordContentReport(
  input: Omit<ContentReport, 'id' | 'occurredAtDevice' | 'appVersion'> & { occurredAt?: string }
): Promise<ContentReport> {
  const report: ContentReport = {
    id: eventId(),
    uid: input.uid,
    seedId: input.seedId,
    revision: input.revision,
    ...(input.blockId ? { blockId: input.blockId } : {}),
    category: input.category,
    ...(input.detail ? { detail: input.detail.slice(0, 1000) } : {}),
    occurredAtDevice: input.occurredAt ?? new Date().toISOString(),
    appVersion: appVersion(),
  };

  await enqueue('content-report', report.id, report as unknown as Record<string, unknown>);
  return report;
}
