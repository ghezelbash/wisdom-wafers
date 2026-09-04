import { ProgressEventSchema, type ProgressEvent } from '@dananeh/content-schema';
import { FieldValue } from 'firebase-admin/firestore';

import type { Deps } from '../shared/deps';

export interface IngestResult {
  applied: number;
  /** Events already seen: a retried outbox must not double-count anything. */
  duplicates: number;
  rejected: { id: string; reason: string }[];
}

/** The reader's own calendar day, not the server's — a completion at 00:30 in
 *  Tehran belongs to that day, wherever the function happens to run. */
export function localDate(occurredAt: string, timezone: string): string {
  const date = new Date(occurredAt);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // An unknown timezone is a client bug, not a reason to drop the event.
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Applies queued progress events.
 *
 * Two properties matter more than throughput:
 *   - **idempotent**: the outbox retries, so every event carries an id and is
 *     recorded once. Completion, streak and any future reward are derived here,
 *     not trusted from the client.
 *   - **monotonic**: a completed seed never returns to in-progress, and the
 *     recorded percentage only goes up within a revision.
 */
export async function ingestProgressEvents(
  deps: Deps,
  input: { uid: string; events: unknown[] }
): Promise<IngestResult> {
  const result: IngestResult = { applied: 0, duplicates: 0, rejected: [] };

  for (const raw of input.events) {
    const parsed = ProgressEventSchema.safeParse(raw);
    if (!parsed.success) {
      const id = (raw as { id?: string })?.id ?? 'unknown';
      result.rejected.push({ id, reason: parsed.error.issues[0]?.message ?? 'invalid' });
      continue;
    }

    const event = parsed.data;
    if (event.uid !== input.uid) {
      // The caller's identity wins; an event claiming another uid is dropped.
      result.rejected.push({ id: event.id, reason: 'uid-mismatch' });
      continue;
    }

    const applied = await applyEvent(deps, event);
    if (applied) result.applied += 1;
    else result.duplicates += 1;
  }

  return result;
}

async function applyEvent(deps: Deps, event: ProgressEvent): Promise<boolean> {
  const userRef = deps.db.collection('users').doc(event.uid);
  const eventRef = userRef.collection('eventLog').doc(event.id);
  const progressRef = userRef.collection('progress').doc(event.seedId);

  return deps.db.runTransaction(async (transaction) => {
    const [seen, progressSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(progressRef),
    ]);

    if (seen.exists) return false;

    const current = progressSnapshot.data();
    const alreadyCompleted = current?.status === 'completed';
    const isCompletion = event.type === 'completed';

    transaction.set(eventRef, {
      type: event.type,
      seedId: event.seedId,
      revision: event.revision,
      occurredAtDevice: event.occurredAtDevice,
      receivedAt: deps.now().toISOString(),
      appVersion: event.appVersion,
    });

    transaction.set(
      progressRef,
      {
        seedId: event.seedId,
        revision: event.revision,
        status: isCompletion || alreadyCompleted ? 'completed' : 'in_progress',
        percent: isCompletion ? 100 : (current?.percent ?? 0),
        updatedAt: deps.now().toISOString(),
        ...(isCompletion && !alreadyCompleted
          ? { completedAt: event.occurredAtDevice }
          : {}),
      },
      { merge: true }
    );

    // Aggregates count a seed once, however many times its completion event
    // arrives — the client may have queued it on two devices.
    if (isCompletion && !alreadyCompleted) {
      const day = localDate(event.occurredAtDevice, event.timezone);

      transaction.set(
        userRef.collection('daily').doc(day),
        { date: day, seedsCompleted: FieldValue.increment(1) },
        { merge: true }
      );

      transaction.set(
        deps.db.collection('userStats').doc(event.uid),
        {
          seedsCompleted: FieldValue.increment(1),
          lastCompletedAt: event.occurredAtDevice,
          lastActiveDay: day,
          updatedAt: deps.now().toISOString(),
        },
        { merge: true }
      );
    }

    if (event.type === 'reviewed') {
      transaction.set(
        deps.db.collection('userStats').doc(event.uid),
        { reviewsCompleted: FieldValue.increment(1), updatedAt: deps.now().toISOString() },
        { merge: true }
      );
    }

    return true;
  });
}
