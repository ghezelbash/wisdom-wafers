import type { SeedManifest } from '@dananeh/content-schema';

import { normalize } from '@/lib/search';
import type { Seed } from '@/models/seed';

import { migrate } from './migrations';
import { isDead, nextAttemptAt } from './retry';
import type { SqlDriver } from './sql';

/**
 * The device's own copy of everything.
 *
 * Reads never touch the network: the catalogue, progress and the outbox all
 * live here, and sync reconciles in the background. Every method takes the
 * driver, so the store has no ambient state and can be pointed at a test
 * database.
 */

export interface StoredProgress {
  seedId: string;
  revision: number;
  blockIndex: number;
  status: 'in_progress' | 'completed';
  saved: boolean;
  answers: Record<string, unknown>;
  reflection?: string;
  completedAt?: string;
  reviewedAt?: string;
  reviewInterval?: number;
  reviewCount: number;
  updatedAt: string;
}

export interface QueuedItem {
  eventId: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  dead: boolean;
  queuedAt: string;
}

export async function open(driver: SqlDriver) {
  // WAL keeps a read during a write from blocking the UI thread's query.
  await driver.exec('PRAGMA journal_mode = WAL').catch(() => {});
  await driver.exec('PRAGMA foreign_keys = ON').catch(() => {});
  await migrate(driver);
  return driver;
}

// ------------------------------------------------------------------ catalogue

/**
 * The write half of `putSeeds`, without a transaction of its own.
 *
 * SQLite has no nested transactions, so anything that needs to write seeds as
 * part of a larger atomic swap calls this and owns the transaction itself.
 */
export async function writeSeeds(driver: SqlDriver, seeds: Seed[], now = new Date().toISOString()) {
  {
    for (const seed of seeds) {
      await driver.run(
        `INSERT INTO catalog_seed
           (seed_id, revision, locale, title, title_norm, topic_id, estimated_minutes, difficulty, manifest_json, seed_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(seed_id) DO UPDATE SET
           revision = excluded.revision,
           title = excluded.title,
           title_norm = excluded.title_norm,
           topic_id = excluded.topic_id,
           estimated_minutes = excluded.estimated_minutes,
           difficulty = excluded.difficulty,
           manifest_json = excluded.manifest_json,
           seed_json = excluded.seed_json,
           updated_at = excluded.updated_at`,
        [
          seed.id,
          seed.revision,
          'fa-IR',
          seed.title,
          normalize(`${seed.title} ${seed.promise}`),
          seed.topicId,
          seed.estimatedMinutes,
          seed.difficulty,
          // `manifest_json` predates the manifest concept and now holds the same
          // seed JSON as `seed_json`; migration 2 renamed the column in place
          // rather than dropping one a rolled-back build would still read.
          JSON.stringify(seed),
          JSON.stringify(seed),
          now,
        ]
      );

      // The search index is rebuilt from the same normaliser the query uses;
      // two implementations would drift and make results unexplainable.
      await driver.run('DELETE FROM search_token WHERE seed_id = ?', [seed.id]);
      const tokens = new Set(
        normalize(`${seed.title} ${seed.promise}`).split(' ').filter((token) => token.length > 1)
      );
      for (const token of tokens) {
        await driver.run(
          'INSERT OR REPLACE INTO search_token (token, seed_id, weight) VALUES (?, ?, ?)',
          [token, seed.id, 1]
        );
      }
    }
  }
}

export async function putSeeds(driver: SqlDriver, seeds: Seed[], now = new Date().toISOString()) {
  await driver.transaction(() => writeSeeds(driver, seeds, now));
}

export async function listSeeds(driver: SqlDriver): Promise<Seed[]> {
  const rows = await driver.all<{ seed_json: string }>(
    'SELECT seed_json FROM catalog_seed ORDER BY seed_id'
  );
  return rows.map((row) => JSON.parse(row.seed_json) as Seed);
}

/** Removes seeds the catalogue no longer publishes, and their search tokens. */
export async function deleteSeeds(driver: SqlDriver, seedIds: string[]) {
  for (const seedId of seedIds) {
    await driver.run('DELETE FROM catalog_seed WHERE seed_id = ?', [seedId]);
    await driver.run('DELETE FROM search_token WHERE seed_id = ?', [seedId]);
  }
}

export async function searchSeeds(driver: SqlDriver, queryText: string): Promise<string[]> {
  const terms = normalize(queryText).split(' ').filter(Boolean);
  if (!terms.length) return [];

  // Every term must match, which is what makes a two-word query narrow rather
  // than broaden the result.
  const rows = await driver.all<{ seed_id: string; hits: number }>(
    `SELECT seed_id, COUNT(DISTINCT token) AS hits
       FROM search_token
      WHERE ${terms.map(() => 'token LIKE ?').join(' OR ')}
      GROUP BY seed_id
     HAVING hits >= ?
      ORDER BY hits DESC, seed_id`,
    [...terms.map((term) => `${term}%`), terms.length]
  );

  return rows.map((row) => row.seed_id);
}

// ------------------------------------------------------------------- progress

function rowToProgress(row: Record<string, unknown>): StoredProgress {
  return {
    seedId: row.seed_id as string,
    revision: row.revision as number,
    blockIndex: row.block_index as number,
    status: row.status as StoredProgress['status'],
    saved: Boolean(row.saved),
    answers: JSON.parse((row.answers_json as string) ?? '{}'),
    reflection: (row.reflection as string) ?? undefined,
    completedAt: (row.completed_at as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    reviewInterval: (row.review_interval as number) ?? undefined,
    reviewCount: (row.review_count as number) ?? 0,
    updatedAt: row.updated_at as string,
  };
}

export async function saveProgress(driver: SqlDriver, progress: StoredProgress) {
  await driver.run(
    `INSERT INTO progress_local
       (seed_id, revision, block_index, status, saved, answers_json, reflection,
        completed_at, reviewed_at, review_interval, review_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(seed_id) DO UPDATE SET
       revision = excluded.revision,
       block_index = excluded.block_index,
       status = excluded.status,
       saved = excluded.saved,
       answers_json = excluded.answers_json,
       reflection = excluded.reflection,
       -- Completion is monotonic here too: the column never goes back to null.
       completed_at = COALESCE(progress_local.completed_at, excluded.completed_at),
       reviewed_at = excluded.reviewed_at,
       review_interval = excluded.review_interval,
       review_count = excluded.review_count,
       updated_at = excluded.updated_at`,
    [
      progress.seedId,
      progress.revision,
      progress.blockIndex,
      progress.status,
      progress.saved ? 1 : 0,
      JSON.stringify(progress.answers ?? {}),
      progress.reflection ?? null,
      progress.completedAt ?? null,
      progress.reviewedAt ?? null,
      progress.reviewInterval ?? null,
      progress.reviewCount ?? 0,
      progress.updatedAt,
    ]
  );
}

export async function getProgress(
  driver: SqlDriver,
  seedId: string
): Promise<StoredProgress | null> {
  const rows = await driver.all('SELECT * FROM progress_local WHERE seed_id = ?', [seedId]);
  return rows.length ? rowToProgress(rows[0]) : null;
}

export async function listProgress(driver: SqlDriver): Promise<StoredProgress[]> {
  const rows = await driver.all('SELECT * FROM progress_local ORDER BY updated_at DESC');
  return rows.map(rowToProgress);
}

export async function deleteProgress(driver: SqlDriver, seedId: string) {
  await driver.run('DELETE FROM progress_local WHERE seed_id = ?', [seedId]);
}

export async function deleteAllProgress(driver: SqlDriver) {
  await driver.run('DELETE FROM progress_local');
}

// --------------------------------------------------------------------- outbox

function rowToQueued(row: Record<string, unknown>): QueuedItem {
  return {
    eventId: row.event_id as string,
    kind: row.kind as string,
    payload: JSON.parse(row.payload_json as string),
    attempts: row.attempts as number,
    nextAttemptAt: row.next_attempt_at as string,
    lastError: (row.last_error as string) ?? undefined,
    dead: Boolean(row.dead),
    queuedAt: row.queued_at as string,
  };
}

export async function enqueue(
  driver: SqlDriver,
  item: { eventId: string; kind: string; payload: Record<string, unknown> },
  now = new Date()
) {
  await driver.run(
    `INSERT OR IGNORE INTO outbox (event_id, kind, payload_json, attempts, next_attempt_at, queued_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [item.eventId, item.kind, JSON.stringify(item.payload), now.toISOString(), now.toISOString()]
  );
}

/**
 * Replaces a queued item's payload, or queues it.
 *
 * For the things that are **state rather than events**: a reader's pace, or
 * whether one seed is bookmarked. An event is a fact that happened and every
 * one of them has to arrive; state has exactly one correct value, and only the
 * last is worth sending.
 *
 * Written as an upsert on a deterministic id so that dragging a slider thirty
 * times leaves one row rather than thirty. Sending thirty would be correct and
 * pointless; queueing thirty is how a queue grows without bound.
 *
 * The retry budget resets, because this is a new intent and not a retry of the
 * old one — and a dead letter comes back to life for the same reason.
 */
export async function upsert(
  driver: SqlDriver,
  item: { eventId: string; kind: string; payload: Record<string, unknown> },
  now = new Date()
) {
  await driver.run(
    `INSERT INTO outbox (event_id, kind, payload_json, attempts, next_attempt_at, queued_at, dead, last_error)
     VALUES (?, ?, ?, 0, ?, ?, 0, NULL)
     ON CONFLICT(event_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       attempts = 0,
       next_attempt_at = excluded.next_attempt_at,
       dead = 0,
       last_error = NULL`,
    [item.eventId, item.kind, JSON.stringify(item.payload), now.toISOString(), now.toISOString()]
  );
}

/** Items ready to send: not dead, and past their backoff. */
export async function dueItems(driver: SqlDriver, now = new Date()): Promise<QueuedItem[]> {
  const rows = await driver.all(
    `SELECT * FROM outbox WHERE dead = 0 AND next_attempt_at <= ? ORDER BY queued_at`,
    [now.toISOString()]
  );

  return rows.map(rowToQueued);
}

export async function markSent(driver: SqlDriver, eventId: string) {
  await driver.run('DELETE FROM outbox WHERE event_id = ?', [eventId]);
}

/**
 * Delays an item without counting it as an attempt.
 *
 * Used when the server throttles: the item is owed, the send did not fail, and
 * spending attempts on it would eventually dead-letter data the reader created.
 */
export async function deferItem(driver: SqlDriver, eventId: string, until: Date) {
  await driver.run('UPDATE outbox SET next_attempt_at = ? WHERE event_id = ?', [
    until.toISOString(),
    eventId,
  ]);
}

/**
 * Records a failure and schedules the retry — or gives up, keeping the item so
 * the failure can be seen rather than guessed at.
 */
export async function markFailed(
  driver: SqlDriver,
  eventId: string,
  error: string,
  now = new Date(),
  random = Math.random
) {
  const rows = await driver.all<{ attempts: number }>(
    'SELECT attempts FROM outbox WHERE event_id = ?',
    [eventId]
  );
  const attempts = (rows[0]?.attempts ?? 0) + 1;

  await driver.run(
    'UPDATE outbox SET attempts = ?, last_error = ?, next_attempt_at = ?, dead = ? WHERE event_id = ?',
    [
      attempts,
      error.slice(0, 300),
      nextAttemptAt(attempts, now, random),
      isDead(attempts) ? 1 : 0,
      eventId,
    ]
  );
}

export async function allQueued(driver: SqlDriver): Promise<QueuedItem[]> {
  const rows = await driver.all('SELECT * FROM outbox ORDER BY queued_at');
  return rows.map(rowToQueued);
}

/**
 * The server refused this item and always will.
 *
 * It is kept, dead, with the reason — a rejection that vanished would be a
 * completion or a report the reader believes was delivered.
 */
export async function markRejected(driver: SqlDriver, eventId: string, reason: string) {
  await driver.run(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ?, dead = 1 WHERE event_id = ?',
    [`rejected: ${reason}`.slice(0, 300), eventId]
  );
}

/**
 * Rewrites the owner on every queued envelope.
 *
 * The uid lives inside the payload, so this reads, rewrites and writes back
 * rather than updating a column — and it clears the dead flag, because an item
 * that failed as `uid-mismatch` is now addressed to the right account.
 */
export async function reassignOutboxUid(
  driver: SqlDriver,
  from: string,
  to: string,
  now = new Date()
): Promise<number> {
  const rows = await driver.all<{ event_id: string; payload_json: string }>(
    'SELECT event_id, payload_json FROM outbox'
  );

  let moved = 0;
  await driver.transaction(async () => {
    for (const row of rows) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }
      if (payload.uid !== from) continue;

      await driver.run(
        `UPDATE outbox
            SET payload_json = ?, dead = 0, attempts = 0, last_error = NULL, next_attempt_at = ?
          WHERE event_id = ?`,
        [JSON.stringify({ ...payload, uid: to }), now.toISOString(), row.event_id]
      );
      moved += 1;
    }
  });

  return moved;
}

export async function clearOutbox(driver: SqlDriver) {
  await driver.run('DELETE FROM outbox');
}

export async function deadLetters(driver: SqlDriver): Promise<QueuedItem[]> {
  const rows = await driver.all('SELECT * FROM outbox WHERE dead = 1 ORDER BY queued_at');
  return rows.map(rowToQueued);
}

// ------------------------------------------------------------------ downloads

export async function recordDownload(
  driver: SqlDriver,
  entry: {
    seedId: string;
    revision: number;
    state: 'missing' | 'downloading' | 'cached' | 'corrupt';
    bytesTotal: number;
    bytesDone: number;
    imageBytes?: number;
    checksum?: string;
    path?: string;
  },
  now = new Date().toISOString()
) {
  await driver.run(
    `INSERT INTO download (seed_id, revision, state, bytes_total, bytes_done, image_bytes, checksum, path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(seed_id) DO UPDATE SET
       revision = excluded.revision,
       state = excluded.state,
       bytes_total = excluded.bytes_total,
       bytes_done = excluded.bytes_done,
       image_bytes = excluded.image_bytes,
       checksum = excluded.checksum,
       path = excluded.path,
       updated_at = excluded.updated_at`,
    [
      entry.seedId,
      entry.revision,
      entry.state,
      entry.bytesTotal,
      entry.bytesDone,
      entry.imageBytes ?? 0,
      entry.checksum ?? null,
      entry.path ?? null,
      now,
    ]
  );
}

export async function listDownloads(driver: SqlDriver) {
  return driver.all('SELECT * FROM download ORDER BY seed_id');
}

export async function getDownload(driver: SqlDriver, seedId: string) {
  const rows = await driver.all('SELECT * FROM download WHERE seed_id = ?', [seedId]);
  return rows[0] ?? null;
}

export async function deleteDownload(driver: SqlDriver, seedId: string) {
  await driver.run('DELETE FROM download WHERE seed_id = ?', [seedId]);
}

/**
 * The commit point of a download.
 *
 * The verified file is already on disk when this runs; this transaction is what
 * makes it *count*. Manifest and download row land together, so there is never
 * a row claiming a cached seed whose manifest says something else — and if the
 * commit throws, the caller deletes the file rather than leaving an orphan.
 */
export async function commitDownload(
  driver: SqlDriver,
  input: { manifest: SeedManifest; path: string; bytes: number; imageBytes?: number },
  now = new Date().toISOString()
) {
  await driver.transaction(async () => {
    await writeManifests(driver, [input.manifest], now);
    await recordDownload(
      driver,
      {
        seedId: input.manifest.seedId,
        revision: input.manifest.revision,
        state: 'cached',
        bytesTotal: input.bytes,
        bytesDone: input.bytes,
        imageBytes: input.imageBytes ?? 0,
        checksum: input.manifest.checksum,
        path: input.path,
      },
      now
    );
  });
}

// ------------------------------------------------------------------ manifests

function rowToManifest(row: Record<string, unknown>): SeedManifest {
  return {
    seedId: row.seed_id as string,
    revision: row.revision as number,
    storagePath: row.storage_path as string,
    checksum: row.checksum as string,
    bytes: row.bytes as number,
    schemaVersion: row.schema_version as number,
    publishedAt: row.published_at as string,
  };
}

/** Transaction-free, so a catalogue swap can write seeds and manifests as one. */
export async function writeManifests(
  driver: SqlDriver,
  manifests: SeedManifest[],
  now = new Date().toISOString()
) {
  for (const manifest of manifests) {
    await driver.run(
      `INSERT INTO seed_manifest
         (seed_id, revision, storage_path, checksum, bytes, schema_version, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(seed_id) DO UPDATE SET
         revision = excluded.revision,
         storage_path = excluded.storage_path,
         checksum = excluded.checksum,
         bytes = excluded.bytes,
         schema_version = excluded.schema_version,
         published_at = excluded.published_at,
         updated_at = excluded.updated_at`,
      [
        manifest.seedId,
        manifest.revision,
        manifest.storagePath,
        manifest.checksum,
        manifest.bytes,
        manifest.schemaVersion,
        manifest.publishedAt,
        now,
      ]
    );
  }
}

export async function listManifests(driver: SqlDriver): Promise<SeedManifest[]> {
  const rows = await driver.all('SELECT * FROM seed_manifest ORDER BY seed_id');
  return rows.map(rowToManifest);
}

export async function getManifest(
  driver: SqlDriver,
  seedId: string
): Promise<SeedManifest | null> {
  const rows = await driver.all('SELECT * FROM seed_manifest WHERE seed_id = ?', [seedId]);
  return rows.length ? rowToManifest(rows[0]) : null;
}

// ----------------------------------------------------------------- sync point

/** Null until a catalogue swap has actually committed. */
export async function getSyncedAt(driver: SqlDriver): Promise<string | null> {
  const rows = await driver.all<{ last_synced_at: string }>(
    'SELECT last_synced_at FROM catalog_sync WHERE id = 1'
  );
  return rows[0]?.last_synced_at ?? null;
}

export async function setSyncedAt(driver: SqlDriver, at: string) {
  await driver.run(
    `INSERT INTO catalog_sync (id, last_synced_at) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
    [at]
  );
}

// ------------------------------------------------------------ catalogue swap

/**
 * Replaces the catalogue in one transaction.
 *
 * Seeds, their manifests and the sync point commit together or not at all, so a
 * refresh that dies halfway leaves the device on the last catalogue that was
 * whole — never on a mix of two, and never with a sync time that claims a
 * freshness the content does not have.
 */
export async function replaceCatalog(
  driver: SqlDriver,
  input: { seeds: Seed[]; manifests: SeedManifest[]; at: string; removeSeedIds?: string[] }
) {
  await driver.transaction(async () => {
    if (input.removeSeedIds?.length) await deleteSeeds(driver, input.removeSeedIds);
    await writeSeeds(driver, input.seeds, input.at);
    await writeManifests(driver, input.manifests, input.at);
    await setSyncedAt(driver, input.at);
  });
}
