import * as local from './local-store';
import { isDead, nextAttemptAt } from './retry';
import type { SqlDriver } from './sql';

/**
 * The queue of everything the device still owes the server.
 *
 * One table, one worker, one set of rules. An item is removed only when the
 * server says it counted — `applied` or `duplicate`. A transport failure is a
 * retry with backoff; a *rejection* is a dead letter that keeps its reason,
 * because an item the server will never accept must stop consuming battery
 * without disappearing silently.
 *
 * SQLite on device, a key-value document elsewhere, behind one API — the same
 * split as the catalogue.
 */

export type OutboxKind =
  | 'progress-event'
  | 'content-report'
  /** Analytics and crash reports, batched to `recordTelemetryBatch`. */
  | 'telemetry-event'
  | 'telemetry-crash'
  /**
   * The reader's own choices, which are **state rather than events**.
   *
   * They used to be written straight to Firestore from the screen that changed
   * them, with a failure logged and forgotten: a pace chosen on a train was
   * simply never sent. They now travel in the same queue as everything else, so
   * offline costs nothing and a restart costs nothing.
   *
   * Queued by upsert on a deterministic id, because only the last value is
   * worth sending — see `upsert` in `local-store.ts`.
   */
  | 'account-preferences'
  | 'account-saved';

/** Kinds that are state: queued by upsert, so the last intent wins. */
export const STATEFUL_KINDS: ReadonlySet<OutboxKind> = new Set([
  'account-preferences',
  'account-saved',
]);

export interface OutboxItem {
  /** The idempotency key. The server deduplicates on it, so a retry counts once. */
  id: string;
  kind: OutboxKind;
  /** A complete, already-valid envelope — never a partial one to be filled in later. */
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  dead: boolean;
  queuedAt: string;
}

export interface OutboxStore {
  /**
   * `now` is a parameter for the same reason it is on `recordFailure` and
   * `defer`: a queue whose timestamps come from the wall clock cannot be tested
   * against a fixed one. The SQL implementation always took it; the key-value
   * one read `new Date()` and silently made every test that enqueued an item
   * depend on the time of day it ran.
   */
  add(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    now?: Date
  ): Promise<void>;
  /** Queues, or replaces what is queued under this id. See `STATEFUL_KINDS`. */
  put(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    now?: Date
  ): Promise<void>;
  /** Not dead, and past its backoff. */
  due(now: Date): Promise<OutboxItem[]>;
  all(): Promise<OutboxItem[]>;
  remove(id: string): Promise<void>;
  recordFailure(id: string, error: string, now: Date): Promise<void>;
  /**
   * Puts an item back to sleep without spending an attempt — what a server-side
   * throttle earns, as opposed to a failure.
   */
  defer(id: string, until: Date): Promise<void>;
  recordRejection(id: string, reason: string): Promise<void>;
  /**
   * Hands every queued envelope from one owner to another.
   *
   * Items that dead-lettered as a uid mismatch come back to life: the reason
   * they failed no longer holds, and the reader's completion is still owed.
   * Returns how many moved.
   */
  reassignUid(from: string, to: string, now: Date): Promise<number>;
  clear(): Promise<void>;
}

// ------------------------------------------------------------------- SQLite

export class SqlOutboxStore implements OutboxStore {
  constructor(private readonly driver: SqlDriver) {}

  async add(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    now = new Date()
  ) {
    // INSERT OR IGNORE: enqueuing the same event id twice is a no-op, so a
    // double-tap cannot become two completions.
    await local.enqueue(
      this.driver,
      { eventId: item.id, kind: item.kind, payload: item.payload },
      now
    );
  }

  async put(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    now = new Date()
  ) {
    await local.upsert(
      this.driver,
      { eventId: item.id, kind: item.kind, payload: item.payload },
      now
    );
  }

  async due(now: Date) {
    return (await local.dueItems(this.driver, now)).map(toItem);
  }

  async all() {
    return (await local.allQueued(this.driver)).map(toItem);
  }

  async remove(id: string) {
    await local.markSent(this.driver, id);
  }

  async recordFailure(id: string, error: string, now: Date) {
    await local.markFailed(this.driver, id, error, now);
  }

  async defer(id: string, until: Date) {
    await local.deferItem(this.driver, id, until);
  }

  async recordRejection(id: string, reason: string) {
    await local.markRejected(this.driver, id, reason);
  }

  async reassignUid(from: string, to: string, now: Date) {
    return local.reassignOutboxUid(this.driver, from, to, now);
  }

  async clear() {
    await local.clearOutbox(this.driver);
  }
}

function toItem(queued: local.QueuedItem): OutboxItem {
  return {
    id: queued.eventId,
    kind: queued.kind as OutboxKind,
    payload: queued.payload,
    attempts: queued.attempts,
    nextAttemptAt: queued.nextAttemptAt,
    lastError: queued.lastError,
    dead: queued.dead,
    queuedAt: queued.queuedAt,
  };
}

// ---------------------------------------------------------------- key-value

export const OUTBOX_KEY = 'dananeh.outbox.v2';

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** The same semantics over one document, for platforms without SQLite. */
export class KeyValueOutboxStore implements OutboxStore {
  constructor(private readonly kv: KeyValue) {}

  private async read(): Promise<OutboxItem[]> {
    try {
      const raw = await this.kv.getItem(OUTBOX_KEY);
      return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    } catch {
      return [];
    }
  }

  private async write(items: OutboxItem[]) {
    try {
      await this.kv.setItem(OUTBOX_KEY, JSON.stringify(items));
    } catch {
      // The caller keeps its in-memory copy for this session either way.
    }
  }

  private async patch(id: string, change: (item: OutboxItem) => OutboxItem) {
    const items = await this.read();
    await this.write(items.map((item) => (item.id === id ? change(item) : item)));
  }

  async add(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    at = new Date()
  ) {
    const items = await this.read();
    if (items.some((existing) => existing.id === item.id)) return;

    const now = at.toISOString();
    await this.write([
      ...items,
      { ...item, attempts: 0, nextAttemptAt: now, dead: false, queuedAt: now },
    ]);
  }

  async put(
    item: { id: string; kind: OutboxKind; payload: Record<string, unknown> },
    at = new Date()
  ) {
    const items = await this.read();
    const now = at.toISOString();
    const existing = items.find((candidate) => candidate.id === item.id);

    // A new intent, not a retry of the old one: the budget resets and a dead
    // letter comes back to life.
    const next: OutboxItem = {
      ...item,
      attempts: 0,
      nextAttemptAt: now,
      dead: false,
      lastError: undefined,
      queuedAt: existing?.queuedAt ?? now,
    };

    await this.write(
      existing ? items.map((candidate) => (candidate.id === item.id ? next : candidate)) : [...items, next]
    );
  }

  async due(now: Date) {
    const at = now.toISOString();
    return (await this.read())
      .filter((item) => !item.dead && item.nextAttemptAt <= at)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  all() {
    return this.read();
  }

  async remove(id: string) {
    const items = await this.read();
    await this.write(items.filter((item) => item.id !== id));
  }

  async recordFailure(id: string, error: string, now: Date) {
    await this.patch(id, (item) => {
      const attempts = item.attempts + 1;
      return {
        ...item,
        attempts,
        lastError: error.slice(0, 300),
        nextAttemptAt: nextAttemptAt(attempts, now),
        dead: isDead(attempts),
      };
    });
  }

  async defer(id: string, until: Date) {
    await this.patch(id, (item) => ({ ...item, nextAttemptAt: until.toISOString() }));
  }

  async recordRejection(id: string, reason: string) {
    await this.patch(id, (item) => ({
      ...item,
      attempts: item.attempts + 1,
      lastError: `rejected: ${reason}`.slice(0, 300),
      dead: true,
    }));
  }

  async reassignUid(from: string, to: string, now: Date) {
    const items = await this.read();
    let moved = 0;

    const next = items.map((item) => {
      if (item.payload.uid !== from) return item;
      moved += 1;
      return {
        ...item,
        payload: { ...item.payload, uid: to },
        dead: false,
        attempts: 0,
        lastError: undefined,
        nextAttemptAt: now.toISOString(),
      };
    });

    if (moved) await this.write(next);
    return moved;
  }

  async clear() {
    await this.write([]);
  }
}

/** The queue for whichever backend this platform has. */
export async function openOutbox(): Promise<OutboxStore> {
  const [{ getLocalDriver }, { default: AsyncStorage }] = await Promise.all([
    import('./expo-driver'),
    import('@react-native-async-storage/async-storage'),
  ]);

  const driver = await getLocalDriver();
  if (driver) {
    await local.open(driver);
    return new SqlOutboxStore(driver);
  }
  return new KeyValueOutboxStore(AsyncStorage);
}
