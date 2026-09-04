import { currentVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../../src/data/local/migrations';
import { backoffMs, isDead, MAX_ATTEMPTS, nextAttemptAt } from '../../src/data/local/retry';
import { mergeProgress, type MergeableProgress } from '../../src/data/local/conflict';
import {
  commitDownload,
  deadLetters,
  deleteDownload,
  dueItems,
  enqueue,
  getDownload,
  getManifest,
  getSyncedAt,
  listManifests,
  replaceCatalog,
  getProgress,
  listProgress,
  listSeeds,
  markFailed,
  markSent,
  open,
  putSeeds,
  recordDownload,
  saveProgress,
  searchSeeds,
  type StoredProgress,
} from '../../src/data/local/local-store';
import type { SqlDriver } from '../../src/data/local/sql';
import { skyDarknessSeed } from '../../src/data/seeds/sky-darkness';
import { nodeSqliteDriver } from '../support/node-sqlite-driver';

/**
 * The local store, exercised against a real SQLite database.
 *
 * This is the layer that has to survive an app that is closed mid-seed and a
 * network that never comes back, so the tests are about persistence and
 * ordering rather than happy-path calls.
 */

let driver: SqlDriver;

beforeEach(async () => {
  driver = nodeSqliteDriver();
  await open(driver);
});

afterEach(async () => {
  await driver.close();
});

describe('migrations', () => {
  it('brings a fresh database to the latest version', async () => {
    expect(await currentVersion(driver)).toBe(LATEST_VERSION);
  });

  it('is a no-op when already current', async () => {
    const result = await migrate(driver);
    expect(result).toEqual({ from: LATEST_VERSION, to: LATEST_VERSION });
  });

  // N-1 → N: an existing device must upgrade without losing what it holds.
  it('applies only the pending migrations to an older database', async () => {
    const older = nodeSqliteDriver();
    const [first] = MIGRATIONS;
    for (const statement of first.up) await older.exec(statement);
    await older.run('INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)', [
      first.version,
      '2026-01-01T00:00:00.000Z',
    ]);
    await older.run(
      `INSERT INTO progress_local (seed_id, revision, block_index, status, saved, answers_json, review_count, updated_at)
       VALUES ('seed-1', 1, 4, 'in_progress', 0, '{}', 0, '2026-01-01T00:00:00.000Z')`
    );

    const result = await migrate(older);
    expect(result.from).toBe(first.version);
    expect(result.to).toBe(LATEST_VERSION);

    const kept = await getProgress(older, 'seed-1');
    expect(kept?.blockIndex).toBe(4);
    await older.close();
  });

  it('never edits a released migration', () => {
    // Versions are unique and ordered: an edited migration would silently skip
    // on devices that already applied it.
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('catalogue', () => {
  it('round-trips a seed through the catalogue table', async () => {
    await putSeeds(driver, [skyDarknessSeed]);

    const seeds = await listSeeds(driver);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].title).toBe(skyDarknessSeed.title);
    expect(seeds[0].blocks).toHaveLength(skyDarknessSeed.blocks.length);
  });

  it('replaces a seed rather than duplicating it on re-sync', async () => {
    await putSeeds(driver, [skyDarknessSeed]);
    await putSeeds(driver, [{ ...skyDarknessSeed, revision: 5, title: 'عنوان تازه' }]);

    const seeds = await listSeeds(driver);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].revision).toBe(5);
  });

  it('searches the normalised index, so spelling variants still match', async () => {
    await putSeeds(driver, [skyDarknessSeed]);

    expect(await searchSeeds(driver, 'آسمان')).toEqual([skyDarknessSeed.id]);
    expect(await searchSeeds(driver, 'اسمان')).toEqual([skyDarknessSeed.id]);
    expect(await searchSeeds(driver, 'ریاضی')).toEqual([]);
  });

  it('requires every term to match', async () => {
    await putSeeds(driver, [skyDarknessSeed]);
    expect(await searchSeeds(driver, 'آسمان تاریک')).toEqual([skyDarknessSeed.id]);
    expect(await searchSeeds(driver, 'آسمان ریاضی')).toEqual([]);
  });
});

describe('manifests and the sync point', () => {
  const manifest = {
    seedId: skyDarknessSeed.id,
    revision: skyDarknessSeed.revision,
    storagePath: `content/seeds/${skyDarknessSeed.id}/${skyDarknessSeed.revision}/bundle.json`,
    checksum: 'a'.repeat(64),
    bytes: 4096,
    schemaVersion: 1,
    publishedAt: '2026-09-03T12:00:00.000Z',
  };

  it('has no sync point until a swap commits', async () => {
    expect(await getSyncedAt(driver)).toBeNull();
  });

  it('writes seeds, manifests and the sync point as one commit', async () => {
    await replaceCatalog(driver, {
      seeds: [skyDarknessSeed],
      manifests: [manifest],
      at: '2026-09-03T12:00:00.000Z',
    });

    expect(await listSeeds(driver)).toHaveLength(1);
    expect(await listManifests(driver)).toEqual([manifest]);
    expect(await getSyncedAt(driver)).toBe('2026-09-03T12:00:00.000Z');
  });

  // The whole point of the transaction: a refresh that dies halfway must leave
  // the device on the last catalogue that was whole, sync time included.
  it('changes nothing when the swap throws partway', async () => {
    await replaceCatalog(driver, {
      seeds: [skyDarknessSeed],
      manifests: [manifest],
      at: '2026-09-03T12:00:00.000Z',
    });

    await expect(
      replaceCatalog(driver, {
        seeds: [{ ...skyDarknessSeed, title: 'عنوان تازه' }],
        // A manifest with a null checksum violates the column constraint, which
        // is the failure this transaction exists to contain.
        manifests: [{ ...manifest, checksum: null as unknown as string }],
        at: '2026-09-04T12:00:00.000Z',
      })
    ).rejects.toBeDefined();

    expect((await listSeeds(driver))[0].title).toBe(skyDarknessSeed.title);
    expect(await getSyncedAt(driver)).toBe('2026-09-03T12:00:00.000Z');
  });

  it('removes seeds the catalogue no longer publishes', async () => {
    await replaceCatalog(driver, {
      seeds: [skyDarknessSeed, { ...skyDarknessSeed, id: 'seed-gone', title: 'رفته' }],
      manifests: [manifest],
      at: '2026-09-03T12:00:00.000Z',
    });

    await replaceCatalog(driver, {
      seeds: [skyDarknessSeed],
      manifests: [manifest],
      at: '2026-09-04T12:00:00.000Z',
      removeSeedIds: ['seed-gone'],
    });

    expect((await listSeeds(driver)).map((seed) => seed.id)).toEqual([skyDarknessSeed.id]);
    expect(await searchSeeds(driver, 'رفته')).toEqual([]);
  });

  it('commits a download and its manifest together', async () => {
    await commitDownload(driver, {
      manifest,
      path: `${manifest.seedId}__${manifest.revision}.json`,
      bytes: 4096,
    });

    expect(await getManifest(driver, manifest.seedId)).toEqual(manifest);
    expect(await getDownload(driver, manifest.seedId)).toMatchObject({
      state: 'cached',
      revision: manifest.revision,
      bytes_total: 4096,
      checksum: manifest.checksum,
    });
  });

  it('keeps the manifest when a download is deleted — the seed is still published', async () => {
    await commitDownload(driver, {
      manifest,
      path: `${manifest.seedId}__${manifest.revision}.json`,
      bytes: 4096,
    });
    await deleteDownload(driver, manifest.seedId);

    expect(await getDownload(driver, manifest.seedId)).toBeNull();
    expect(await getManifest(driver, manifest.seedId)).toEqual(manifest);
  });
});

describe('progress', () => {
  const base: StoredProgress = {
    seedId: 'seed-sky-darkness',
    revision: 4,
    blockIndex: 3,
    status: 'in_progress',
    saved: false,
    answers: { b6: { correct: true } },
    reviewCount: 0,
    updatedAt: '2026-09-03T10:00:00.000Z',
  };

  it('persists and reads back everything the player wrote', async () => {
    await saveProgress(driver, { ...base, reflection: 'یادداشت خصوصی' });

    const stored = await getProgress(driver, base.seedId);
    expect(stored).toMatchObject({ blockIndex: 3, status: 'in_progress', saved: false });
    expect(stored?.answers).toEqual({ b6: { correct: true } });
    expect(stored?.reflection).toBe('یادداشت خصوصی');
  });

  // Autosave writes on every block change; the last write must win cleanly.
  it('updates in place rather than inserting a second row', async () => {
    await saveProgress(driver, base);
    await saveProgress(driver, { ...base, blockIndex: 7, updatedAt: '2026-09-03T10:05:00.000Z' });

    expect(await listProgress(driver)).toHaveLength(1);
    expect((await getProgress(driver, base.seedId))?.blockIndex).toBe(7);
  });

  it('never clears a recorded completion', async () => {
    await saveProgress(driver, {
      ...base,
      status: 'completed',
      completedAt: '2026-09-03T10:10:00.000Z',
    });
    await saveProgress(driver, { ...base, updatedAt: '2026-09-03T10:20:00.000Z' });

    const stored = await getProgress(driver, base.seedId);
    expect(stored?.completedAt).toBe('2026-09-03T10:10:00.000Z');
  });
});

describe('the outbox', () => {
  const item = { eventId: 'event-1', kind: 'completion', payload: { seedId: 'seed-1' } };

  it('queues an event once, however often it is enqueued', async () => {
    await enqueue(driver, item);
    await enqueue(driver, item);

    expect(await dueItems(driver)).toHaveLength(1);
  });

  it('removes an item once it is sent', async () => {
    await enqueue(driver, item);
    await markSent(driver, item.eventId);

    expect(await dueItems(driver)).toHaveLength(0);
  });

  it('holds a failed item back until its backoff has passed', async () => {
    const now = new Date('2026-09-03T10:00:00.000Z');
    await enqueue(driver, item, now);
    await markFailed(driver, item.eventId, 'network', now, () => 1);

    expect(await dueItems(driver, now)).toHaveLength(0);
    const later = new Date(now.getTime() + 60_000);
    expect(await dueItems(driver, later)).toHaveLength(1);
  });

  it('gives up after the ceiling, but keeps the item as a dead letter', async () => {
    const now = new Date('2026-09-03T10:00:00.000Z');
    await enqueue(driver, item, now);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await markFailed(driver, item.eventId, 'network', now, () => 1);
    }

    // Not silently discarded: a queue that drops data is worse than one that
    // stops trying.
    expect(await dueItems(driver, new Date('2030-01-01T00:00:00.000Z'))).toHaveLength(0);
    const dead = await deadLetters(driver);
    expect(dead).toHaveLength(1);
    expect(dead[0].lastError).toBe('network');
  });
});

describe('retry policy', () => {
  it('backs off exponentially and caps', () => {
    expect(backoffMs(1, () => 1)).toBe(30_000);
    expect(backoffMs(2, () => 1)).toBe(60_000);
    expect(backoffMs(20, () => 1)).toBe(6 * 60 * 60 * 1000);
  });

  it('jitters, so devices that dropped together do not return together', () => {
    expect(backoffMs(3, () => 0)).toBeLessThan(backoffMs(3, () => 1));
  });

  it('schedules the next attempt in the future', () => {
    const now = new Date('2026-09-03T10:00:00.000Z');
    expect(new Date(nextAttemptAt(1, now, () => 1)).getTime()).toBeGreaterThan(now.getTime());
  });

  it('declares an item dead only at the ceiling', () => {
    expect(isDead(MAX_ATTEMPTS - 1)).toBe(false);
    expect(isDead(MAX_ATTEMPTS)).toBe(true);
  });
});

describe('conflict resolution', () => {
  const local: MergeableProgress = {
    seedId: 'seed-1',
    revision: 2,
    blockIndex: 5,
    status: 'in_progress',
    saved: true,
    updatedAt: '2026-09-03T10:00:00.000Z',
  };

  it('takes the furthest position within a revision', () => {
    const merged = mergeProgress(local, { ...local, blockIndex: 9, updatedAt: '2026-09-03T09:00:00.000Z' });
    expect(merged.blockIndex).toBe(9);
  });

  it('keeps a completion from either side', () => {
    const merged = mergeProgress(local, {
      ...local,
      status: 'completed',
      completedAt: '2026-09-03T09:30:00.000Z',
      updatedAt: '2026-09-03T09:30:00.000Z',
    });
    expect(merged.status).toBe('completed');
    expect(merged.completedAt).toBe('2026-09-03T09:30:00.000Z');
  });

  it('follows the newer revision, because positions are not comparable across them', () => {
    const merged = mergeProgress(local, { ...local, revision: 3, blockIndex: 1, updatedAt: '2026-09-03T08:00:00.000Z' });
    expect(merged.revision).toBe(3);
    expect(merged.blockIndex).toBe(1);
  });

  it('takes the most recent bookmark intent', () => {
    const merged = mergeProgress(local, { ...local, saved: false, updatedAt: '2026-09-03T11:00:00.000Z' });
    expect(merged.saved).toBe(false);
  });
});

describe('downloads', () => {
  it('tracks state and bytes per seed', async () => {
    await recordDownload(driver, {
      seedId: 'seed-1',
      revision: 1,
      state: 'downloading',
      bytesTotal: 2_600_000,
      bytesDone: 1_200_000,
    });
    await recordDownload(driver, {
      seedId: 'seed-1',
      revision: 1,
      state: 'cached',
      bytesTotal: 2_600_000,
      bytesDone: 2_600_000,
      checksum: 'abc',
      path: 'seeds/seed-1.json',
    });

    const rows = await driver.all<{ state: string; bytes_done: number }>(
      'SELECT state, bytes_done FROM download'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'cached', bytes_done: 2_600_000 });
  });
});
