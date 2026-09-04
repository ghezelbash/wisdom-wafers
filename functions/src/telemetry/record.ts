import { z } from 'zod';

import type { Deps } from '../shared/deps';

/**
 * Where analytics events and crash reports land.
 *
 * The client guards against PII before anything is queued. This guards again,
 * because a client is not a trust boundary: a build with a bug, or an old build
 * still in the field, can send whatever it likes. An event carrying free text
 * is **rejected**, not sanitised — sanitising invites "close enough".
 *
 * Crashlytics and Analytics proper arrive with React Native Firebase. This is
 * the transport that works today, and it makes the funnel and the crash trail
 * visible in the Firebase console rather than nowhere.
 */

/** Parameter names that must never carry free text. Mirrors the client guard. */
const FORBIDDEN_KEY =
  /(email|name|query|text|title|reflection|answer_text|token|phone|address)/i;

/** A scalar, short enough to be a label rather than content. */
const ParamValue = z.union([z.string().max(120), z.number(), z.boolean()]);

export const AnalyticsEventSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().min(1).max(64),
  params: z.record(z.string().max(64), ParamValue).default({}),
  occurredAt: z.string(),
  appVersion: z.string().max(32),
  appVariant: z.string().max(32),
});

export const CrashReportSchema = z.object({
  id: z.string().min(8).max(64),
  message: z.string().max(500),
  context: z.record(z.string().max(64), ParamValue).default({}),
  stack: z.string().max(2000).optional(),
  fatal: z.boolean(),
  occurredAt: z.string(),
  appVersion: z.string().max(32),
  appVariant: z.string().max(32),
});

export interface RecordResult {
  applied: number;
  duplicates: number;
  rejected: { id: string; reason: string }[];
}

/** Refuses a payload whose keys could carry personal content. */
function unsafeKeys(params: Record<string, unknown>): string[] {
  return Object.keys(params).filter((key) => FORBIDDEN_KEY.test(key));
}

async function writeOnce(
  deps: Deps,
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const ref = deps.db.collection(collection).doc(id);
  return deps.db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return false;
    transaction.set(ref, { ...data, receivedAt: deps.now().toISOString() });
    return true;
  });
}

export async function recordTelemetry(
  deps: Deps,
  input: { uid: string; events?: unknown[]; crashes?: unknown[] }
): Promise<RecordResult> {
  const result: RecordResult = { applied: 0, duplicates: 0, rejected: [] };

  for (const raw of input.events ?? []) {
    const parsed = AnalyticsEventSchema.safeParse(raw);
    if (!parsed.success) {
      result.rejected.push({
        id: (raw as { id?: string })?.id ?? 'unknown',
        reason: parsed.error.issues[0]?.message ?? 'invalid',
      });
      continue;
    }

    const unsafe = unsafeKeys(parsed.data.params);
    if (unsafe.length) {
      result.rejected.push({ id: parsed.data.id, reason: `unsafe-key:${unsafe[0]}` });
      continue;
    }

    // The uid comes from the caller, never from the payload: an event cannot
    // claim to be someone else's.
    const written = await writeOnce(deps, 'telemetryEvents', parsed.data.id, {
      ...parsed.data,
      uid: input.uid,
    });
    if (written) result.applied += 1;
    else result.duplicates += 1;
  }

  for (const raw of input.crashes ?? []) {
    const parsed = CrashReportSchema.safeParse(raw);
    if (!parsed.success) {
      result.rejected.push({
        id: (raw as { id?: string })?.id ?? 'unknown',
        reason: parsed.error.issues[0]?.message ?? 'invalid',
      });
      continue;
    }

    const unsafe = unsafeKeys(parsed.data.context);
    if (unsafe.length) {
      result.rejected.push({ id: parsed.data.id, reason: `unsafe-key:${unsafe[0]}` });
      continue;
    }

    const written = await writeOnce(deps, 'crashReports', parsed.data.id, {
      ...parsed.data,
      uid: input.uid,
    });
    if (written) result.applied += 1;
    else result.duplicates += 1;
  }

  return result;
}
