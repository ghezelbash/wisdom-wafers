import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { ingestProgressEvents } from '../../functions/src/progress/ingest';
import { submitReports } from '../../functions/src/reports/submit';
import type { Deps } from '../../functions/src/shared/deps';
import { SqlOutboxStore } from '../../src/data/local/outbox-store';
import * as localStore from '../../src/data/local/local-store';
import type { SqlDriver } from '../../src/data/local/sql';
import { __setOutboxStore, flush, listOutbox, type OutboxItem } from '../../src/lib/outbox';
import { outcomeFor } from '../../src/lib/outbox-ack';
import { nodeSqliteDriver } from '../support/node-sqlite-driver';

/**
 * The outbox against the real backend.
 *
 * A reader finishes a seed on a plane, force-stops the app, lands, and opens it
 * again. What has to be true is narrow and absolute: the completion is in
 * Firestore exactly once, the report they filed is there too, and neither was
 * deleted from the queue before the server said it counted.
 */

const UID = 'reader-1';

let app: App;
let db: Firestore;
let deps: Deps;
let driver: SqlDriver;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8181';
  app = initializeApp({ projectId: 'demo-dananeh' }, 'outbox-delivery');
  db = getFirestore(app);
  deps = {
    db,
    async putObject(path) {
      return path;
    },
    async deleteObjects() {
      return 0;
    },
    async deleteAuthUser() {},
    now: () => new Date('2026-09-04T12:00:00.000Z'),
  };
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  driver = nodeSqliteDriver();
  await localStore.open(driver);
  __setOutboxStore(new SqlOutboxStore(driver));

  for (const path of [`users/${UID}/eventLog`, `users/${UID}/progress`]) {
    const snapshot = await db.collection(path).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
  const reports = await db.collection('reports').get();
  await Promise.all(reports.docs.map((document) => document.ref.delete()));
});

afterEach(async () => {
  __setOutboxStore(null);
  await driver.close();
});

/** The real transport, minus the callable wrapper the emulator would add. */
const sender = async (item: OutboxItem) => {
  if (item.kind === 'content-report') {
    return outcomeFor(item, await submitReports(deps, { uid: UID, reports: [item.payload] }));
  }
  return outcomeFor(item, await ingestProgressEvents(deps, { uid: UID, events: [item.payload] }));
};

const completion = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  uid: UID,
  seedId: 'seed-sky-darkness',
  revision: 4,
  type: 'completed',
  occurredAtDevice: '2026-09-04T11:30:00.000Z',
  timezone: 'Asia/Tehran',
  appVersion: '1.0.0',
  ...overrides,
});

describe('a completion recorded offline', () => {
  it('reaches Firestore once when the network comes back', async () => {
    await localStore.enqueue(driver, {
      eventId: 'event-0001',
      kind: 'progress-event',
      payload: completion('event-0001'),
    });

    // Offline: nothing leaves, nothing is lost.
    expect(await flush(sender, false)).toMatchObject({ sent: 0, remaining: 1 });
    expect((await db.collection(`users/${UID}/eventLog`).get()).size).toBe(0);

    // Online: it lands and leaves the queue.
    expect(await flush(sender, true)).toMatchObject({ sent: 1, remaining: 0 });

    const progress = await db.doc(`users/${UID}/progress/seed-sky-darkness`).get();
    expect(progress.data()).toMatchObject({ status: 'completed', revision: 4 });
  });

  it('counts once even if the same event is delivered twice', async () => {
    const payload = completion('event-0001');

    // The first send succeeds but the answer never reaches the device, so the
    // item is still queued and goes again.
    await ingestProgressEvents(deps, { uid: UID, events: [payload] });
    await localStore.enqueue(driver, { eventId: 'event-0001', kind: 'progress-event', payload });

    const result = await flush(sender, true);
    expect(result).toMatchObject({ sent: 0, duplicates: 1, remaining: 0 });

    // One event in the log, not two — the streak cannot be inflated by a retry.
    expect((await db.collection(`users/${UID}/eventLog`).get()).size).toBe(1);
  });

  it('keeps an event the server refuses, dead and with its reason', async () => {
    await localStore.enqueue(driver, {
      eventId: 'event-badid',
      kind: 'progress-event',
      // Another reader's uid: the server will never accept it, so retrying is
      // pointless — but deleting it would hide that something went wrong.
      payload: completion('event-badid', { uid: 'someone-else' }),
    });

    expect(await flush(sender, true)).toMatchObject({ rejected: 1, remaining: 1 });

    const [item] = await listOutbox();
    expect(item.dead).toBe(true);
    expect(item.lastError).toContain('uid-mismatch');
    expect((await db.collection(`users/${UID}/eventLog`).get()).size).toBe(0);
  });

  it('survives a force-stop: the queue is on disk, not in memory', async () => {
    const file = `${require('node:os').tmpdir()}/dananeh-outbox-${Date.now()}.db`;
    const first = nodeSqliteDriver(file);
    await localStore.open(first);
    await localStore.enqueue(first, {
      eventId: 'event-0001',
      kind: 'progress-event',
      payload: completion('event-0001'),
    });
    await first.close();

    // The app is killed and started again.
    const second = nodeSqliteDriver(file);
    await localStore.open(second);
    __setOutboxStore(new SqlOutboxStore(second));

    expect(await listOutbox()).toHaveLength(1);
    expect(await flush(sender, true)).toMatchObject({ sent: 1, remaining: 0 });
    await second.close();
    require('node:fs').rmSync(file, { force: true });
  });
});

describe('a content report recorded offline', () => {
  const report = (id: string) => ({
    id,
    uid: UID,
    seedId: 'seed-sky-darkness',
    revision: 4,
    blockId: 'block-3',
    category: 'factual',
    detail: 'عدد اشتباه است',
    occurredAtDevice: '2026-09-04T11:30:00.000Z',
    appVersion: '1.0.0',
  });

  it('is delivered rather than filtered out of the queue and dropped', async () => {
    await localStore.enqueue(driver, {
      eventId: 'report-1',
      kind: 'content-report',
      payload: report('report-1'),
    });

    expect(await flush(sender, true)).toMatchObject({ sent: 1, remaining: 0 });

    const stored = await db.doc('reports/report-1').get();
    expect(stored.exists).toBe(true);
    expect(stored.data()).toMatchObject({
      uid: UID,
      category: 'factual',
      status: 'open',
      receivedAt: '2026-09-04T12:00:00.000Z',
    });
  });

  it('is written once when a retry delivers it twice', async () => {
    await submitReports(deps, { uid: UID, reports: [report('report-1')] });
    await localStore.enqueue(driver, {
      eventId: 'report-1',
      kind: 'content-report',
      payload: report('report-1'),
    });

    expect(await flush(sender, true)).toMatchObject({ duplicates: 1, remaining: 0 });
    expect((await db.collection('reports').get()).size).toBe(1);
  });

  it('refuses a report claiming another reader', async () => {
    const result = await submitReports(deps, {
      uid: UID,
      reports: [{ ...report('report-2'), uid: 'someone-else' }],
    });

    expect(result.rejected).toEqual([{ id: 'report-2', reason: 'uid-mismatch' }]);
    expect((await db.collection('reports').get()).size).toBe(0);
  });

  it('refuses a category outside the five the team triages', async () => {
    const result = await submitReports(deps, {
      uid: UID,
      reports: [{ ...report('report-3'), category: 'anything' }],
    });

    expect(result.rejected).toHaveLength(1);
    expect((await db.collection('reports').get()).size).toBe(0);
  });
});
