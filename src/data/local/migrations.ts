import type { SqlDriver } from './sql';

/**
 * Forward-only migrations.
 *
 * Each entry runs once, in order, and is never edited afterwards — a released
 * migration is history. Nothing here drops a column or a table: a shape that is
 * no longer read stays for at least one release, so a rollback of the app does
 * not strand the data on a device.
 */
export interface Migration {
  version: number;
  name: string;
  up: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-catalog-progress-outbox',
    up: [
      `CREATE TABLE IF NOT EXISTS schema_meta (
         version INTEGER NOT NULL,
         applied_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS catalog_seed (
         seed_id TEXT PRIMARY KEY,
         revision INTEGER NOT NULL,
         locale TEXT NOT NULL,
         title TEXT NOT NULL,
         title_norm TEXT NOT NULL,
         topic_id TEXT NOT NULL,
         estimated_minutes INTEGER NOT NULL,
         difficulty TEXT NOT NULL,
         manifest_json TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS catalog_seed_topic ON catalog_seed (topic_id)`,
      `CREATE TABLE IF NOT EXISTS download (
         seed_id TEXT PRIMARY KEY,
         revision INTEGER NOT NULL,
         state TEXT NOT NULL,
         bytes_total INTEGER NOT NULL DEFAULT 0,
         bytes_done INTEGER NOT NULL DEFAULT 0,
         image_bytes INTEGER NOT NULL DEFAULT 0,
         checksum TEXT,
         path TEXT,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS progress_local (
         seed_id TEXT PRIMARY KEY,
         revision INTEGER NOT NULL,
         block_index INTEGER NOT NULL DEFAULT 0,
         status TEXT NOT NULL DEFAULT 'in_progress',
         saved INTEGER NOT NULL DEFAULT 0,
         answers_json TEXT NOT NULL DEFAULT '{}',
         reflection TEXT,
         completed_at TEXT,
         reviewed_at TEXT,
         review_interval INTEGER,
         review_count INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS outbox (
         event_id TEXT PRIMARY KEY,
         kind TEXT NOT NULL,
         payload_json TEXT NOT NULL,
         attempts INTEGER NOT NULL DEFAULT 0,
         next_attempt_at TEXT NOT NULL,
         last_error TEXT,
         dead INTEGER NOT NULL DEFAULT 0,
         queued_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS outbox_ready ON outbox (dead, next_attempt_at)`,
      `CREATE TABLE IF NOT EXISTS search_token (
         token TEXT NOT NULL,
         seed_id TEXT NOT NULL,
         weight REAL NOT NULL DEFAULT 1,
         PRIMARY KEY (token, seed_id)
       )`,
      `CREATE INDEX IF NOT EXISTS search_token_token ON search_token (token)`,
    ],
  },
  {
    version: 2,
    name: 'seed-manifest-and-sync-point',
    up: [
      // `manifest_json` was always the seed JSON, which the manifest type now
      // makes actively misleading. The column stays — nothing is dropped — and
      // reads move to the new name.
      `ALTER TABLE catalog_seed ADD COLUMN seed_json TEXT NOT NULL DEFAULT '{}'`,
      `UPDATE catalog_seed SET seed_json = manifest_json WHERE seed_json = '{}'`,
      // What a device needs to fetch a revision and prove it is the published
      // one. Kept apart from `download` because it describes the *content*,
      // which is true whether or not the reader kept a copy.
      `CREATE TABLE IF NOT EXISTS seed_manifest (
         seed_id TEXT PRIMARY KEY,
         revision INTEGER NOT NULL,
         storage_path TEXT NOT NULL,
         checksum TEXT NOT NULL,
         bytes INTEGER NOT NULL DEFAULT 0,
         schema_version INTEGER NOT NULL,
         published_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      // One row, written only after a catalogue swap commits — so "last true"
      // cannot advance on a refresh that failed.
      `CREATE TABLE IF NOT EXISTS catalog_sync (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         last_synced_at TEXT NOT NULL
       )`,
    ],
  },
  {
    version: 3,
    name: 'typed-outbox-kinds',
    up: [
      // The queue used to hold `completion` and `report` items whose payloads
      // were missing the fields the server requires — they could never have
      // been delivered, and keeping them would only produce dead letters for
      // events that were never sendable. Nothing has shipped, so they go.
      `DELETE FROM outbox WHERE kind NOT IN ('progress-event', 'content-report')`,
      `CREATE INDEX IF NOT EXISTS outbox_kind ON outbox (kind)`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function currentVersion(driver: SqlDriver): Promise<number> {
  try {
    const rows = await driver.all<{ version: number }>(
      'SELECT version FROM schema_meta ORDER BY version DESC LIMIT 1'
    );
    return rows[0]?.version ?? 0;
  } catch {
    // No schema_meta yet: a fresh database, not a failure.
    return 0;
  }
}

/**
 * Brings a database up to the latest version.
 *
 * Each migration runs in its own transaction so a failure halfway leaves the
 * database at the last version that fully applied, rather than in a shape no
 * code has ever seen.
 */
export async function migrate(driver: SqlDriver, now = () => new Date().toISOString()) {
  const from = await currentVersion(driver);

  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;

    await driver.transaction(async () => {
      for (const statement of migration.up) {
        await driver.exec(statement);
      }
      await driver.run('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)', [
        migration.version,
        now(),
      ]);
    });
  }

  return { from, to: LATEST_VERSION };
}
