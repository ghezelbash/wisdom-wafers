import type { Deps } from '../shared/deps';

/**
 * Telemetry that deletes itself, and a daily figure an operator can read.
 *
 * Crashlytics is not here yet — it needs native modules — so `crashReports` and
 * `telemetryEvents` in Firestore *are* the crash and funnel trail for the
 * staging APK. Two things follow from that, and neither existed:
 *
 *  - **They have to expire.** A collection nobody deletes grows without limit,
 *    costs money forever, and turns a modest privacy promise into a permanent
 *    record of what every reader did. Retention is a property of the system,
 *    not a note in a document.
 *  - **Somebody has to be able to look.** A thousand crash documents are not an
 *    alert. The digest turns a day into one document with the numbers the
 *    thresholds in `docs/runbooks/observability.md` are written against.
 *
 * Both are plain functions over injected `Deps`, so they run in a scheduled
 * function, in a test against the emulator, and from the operator script.
 */

/** Deliberately short: this is a beta signal, not an archive. */
export const RETENTION_DAYS = { telemetryEvents: 30, crashReports: 90 } as const;

export type TelemetryCollection = keyof typeof RETENTION_DAYS;

export const cutoffFor = (collection: TelemetryCollection, now: Date): string =>
  new Date(now.getTime() - RETENTION_DAYS[collection] * 24 * 60 * 60 * 1000).toISOString();

/**
 * Deletes what is past its retention, in bounded batches.
 *
 * Bounded because a sweep that tries to delete a year of backlog in one call
 * times out and deletes nothing — a partial sweep that runs again tomorrow is
 * strictly better than a complete one that never finishes.
 */
export async function sweepExpired(
  deps: Deps,
  options: { collection: TelemetryCollection; limit?: number }
): Promise<{ deleted: number; remaining: boolean }> {
  const limit = options.limit ?? 400;
  const cutoff = cutoffFor(options.collection, deps.now());

  const expired = await deps.db
    .collection(options.collection)
    .where('receivedAt', '<', cutoff)
    .limit(limit)
    .get();

  if (expired.empty) return { deleted: 0, remaining: false };

  const batch = deps.db.batch();
  for (const document of expired.docs) batch.delete(document.ref);
  await batch.commit();

  // `remaining` is what tells the caller to come back rather than to assume the
  // collection is clean.
  return { deleted: expired.size, remaining: expired.size === limit };
}

export interface OpsDigest {
  day: string;
  crashes: number;
  fatalCrashes: number;
  /** Distinct sessions that crashed — one reader hitting a bug thirty times
   *  is a different decision from thirty readers hitting it once. */
  affectedSessions: number;
  events: number;
  /** The crash messages that happened most, already scrubbed by the client. */
  topMessages: { message: string; count: number }[];
  /** Funnel counts, so a collapse is visible without a query. */
  eventCounts: Record<string, number>;
  builds: Record<string, number>;
  computedAt: string;
}

const dayBounds = (day: string) => ({
  from: `${day}T00:00:00.000Z`,
  to: `${day}T23:59:59.999Z`,
});

const tally = (values: string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

/**
 * One day, as one document.
 *
 * Read from `occurredAt` rather than `receivedAt`: a crash that happened
 * offline on Tuesday and arrived on Thursday belongs to Tuesday, or the day a
 * release went wrong looks quiet and the day after it looks catastrophic.
 */
export async function buildOpsDigest(deps: Deps, day: string): Promise<OpsDigest> {
  const { from, to } = dayBounds(day);

  const [crashes, events] = await Promise.all([
    deps.db
      .collection('crashReports')
      .where('occurredAt', '>=', from)
      .where('occurredAt', '<=', to)
      .get(),
    deps.db
      .collection('telemetryEvents')
      .where('occurredAt', '>=', from)
      .where('occurredAt', '<=', to)
      .get(),
  ]);

  const crashData = crashes.docs.map((document) => document.data());
  const sessions = new Set(
    crashData
      .map((crash) => (crash.context as { session_id?: string } | undefined)?.session_id)
      .filter((id): id is string => typeof id === 'string')
  );

  const messages = tally(crashData.map((crash) => String(crash.message)));

  return {
    day,
    crashes: crashes.size,
    fatalCrashes: crashData.filter((crash) => crash.fatal === true).length,
    affectedSessions: sessions.size,
    events: events.size,
    topMessages: Object.entries(messages)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    eventCounts: tally(events.docs.map((document) => String(document.data().name))),
    builds: tally(crashData.map((crash) => `${crash.appVariant}@${crash.appVersion}`)),
    computedAt: deps.now().toISOString(),
  };
}

/** Writes the digest where an operator — and the diagnose script — can read it. */
export async function writeOpsDigest(deps: Deps, day: string): Promise<OpsDigest> {
  const digest = await buildOpsDigest(deps, day);
  await deps.db.doc(`opsDigest/${day}`).set(digest);
  return digest;
}
