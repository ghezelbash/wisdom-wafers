import { getApps } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { usingEmulator } from '@/data/remote/firebase-app';
import { outcomeFor, ThrottledError, type BatchResult } from '@/lib/outbox-ack';
import type { OutboxItem, SendOutcome } from '@/lib/outbox';

/**
 * The outbox's transport.
 *
 * The queue owns retry and ordering; this only knows how to hand one item over
 * and what the server said about it. The distinction it has to preserve is the
 * one the old sender collapsed: a network failure means *try again*, while a
 * rejection means *this will never be accepted* — and neither means "delivered".
 *
 * There is a third answer: `resource-exhausted`, the server's rate limit. It is
 * neither — the item is still owed and will be accepted later — so it is raised
 * as `ThrottledError` and the queue defers it without spending an attempt.
 */

/** Seconds to wait, taken from the server rather than guessed. */
const DEFAULT_RETRY_AFTER_SECONDS = 30;

function throttleFrom(error: unknown): ThrottledError | null {
  const code = (error as { code?: string })?.code;
  if (code !== 'functions/resource-exhausted' && code !== 'resource-exhausted') return null;

  const details = (error as { details?: { retryAfterSeconds?: unknown } })?.details;
  const seconds = details?.retryAfterSeconds;
  return new ThrottledError(
    typeof seconds === 'number' && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS
  );
}

const ENDPOINT: Record<OutboxItem['kind'], { name: string; field: string }> = {
  'progress-event': { name: 'ingestProgress', field: 'events' },
  'content-report': { name: 'submitReport', field: 'reports' },
  'telemetry-event': { name: 'recordTelemetryBatch', field: 'events' },
  'telemetry-crash': { name: 'recordTelemetryBatch', field: 'crashes' },
};

const callables = new Map<string, ReturnType<typeof httpsCallable>>();

function getCallable(name: string) {
  const existing = callables.get(name);
  if (existing) return existing;

  const app = getApps()[0];
  if (!app) throw new Error('firebase-not-initialised');

  const functions = getFunctions(app, 'europe-west1');
  if (usingEmulator) connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  const callable = httpsCallable(functions, name);
  callables.set(name, callable);
  return callable;
}

/** Sends one item and reports what the server made of it. */
export async function sendOutboxItem(item: OutboxItem): Promise<SendOutcome> {
  const endpoint = ENDPOINT[item.kind];
  if (!endpoint) {
    // A kind this build does not know how to send is not a network problem, and
    // retrying it forever would be noise.
    return { status: 'rejected', reason: `unknown-kind:${item.kind}` };
  }

  const response = await getCallable(endpoint.name)({
    [endpoint.field]: [item.payload],
  }).catch((error: unknown) => {
    const throttled = throttleFrom(error);
    if (throttled) throw throttled;
    throw error;
  });

  return outcomeFor(item, (response.data ?? {}) as BatchResult);
}
