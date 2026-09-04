import { ProgressEventSchema } from '@dananeh/content-schema';

import { KeyValueOutboxStore, type KeyValue } from '@/data/local/outbox-store';
import {
  eventId,
  InvalidEventError,
  progressEvent,
  recordCompletion,
  recordContentReport,
  recordReviewed,
} from '@/domain/progress/events';
import { __setOutboxStore, listOutbox } from '@/lib/outbox';

/**
 * The envelope.
 *
 * The bug this replaces was a screen enqueuing `{seedId, revision, completedAt}`
 * — three of the nine fields the server needs. The event is built in one place
 * now, and validated against the same schema the ingest Function parses with,
 * so an incomplete one cannot reach the queue at all.
 */

function memoryKeyValue(): KeyValue {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  __setOutboxStore(new KeyValueOutboxStore(memoryKeyValue()));
});

afterEach(() => {
  __setOutboxStore(null);
});

describe('building an event', () => {
  it('produces something the server schema accepts', () => {
    const event = progressEvent({
      uid: 'user-1',
      seedId: 'seed-sky-darkness',
      revision: 4,
      type: 'completed',
    });

    expect(ProgressEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({ uid: 'user-1', seedId: 'seed-sky-darkness', type: 'completed' });
    expect(event.appVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(event.timezone.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(event.occurredAtDevice))).toBe(false);
  });

  it('refuses to build an event that is missing what the server requires', () => {
    expect(() => progressEvent({ uid: '', seedId: 'seed-1', revision: 4, type: 'completed' })).toThrow(
      InvalidEventError
    );
    expect(() =>
      progressEvent({ uid: 'user-1', seedId: 'seed-1', revision: 0, type: 'completed' })
    ).toThrow(InvalidEventError);
  });

  it('mints ids that do not collide within a millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, () => eventId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(8);
  });
});

describe('queueing what the reader did', () => {
  it('queues a completion as a complete envelope', async () => {
    await recordCompletion({ uid: 'user-1', seedId: 'seed-1', revision: 2 });

    const [item] = await listOutbox();
    expect(item.kind).toBe('progress-event');
    expect(item.id).toBe(item.payload.id);
    expect(ProgressEventSchema.safeParse(item.payload).success).toBe(true);
    expect(item.payload.type).toBe('completed');
  });

  it('queues a review with the confidence the reader gave', async () => {
    await recordReviewed({ uid: 'user-1', seedId: 'seed-1', revision: 2, confidence: 'hard' });

    const [item] = await listOutbox();
    expect(item.payload).toMatchObject({ type: 'reviewed', confidence: 'hard' });
  });

  it('queues a report, so being offline does not cost one', async () => {
    await recordContentReport({
      uid: 'user-1',
      seedId: 'seed-1',
      revision: 2,
      blockId: 'block-3',
      category: 'factual',
      detail: 'عدد اشتباه است',
    });

    const [item] = await listOutbox();
    expect(item.kind).toBe('content-report');
    expect(item.payload).toMatchObject({ category: 'factual', blockId: 'block-3' });
  });

  it('caps a report detail rather than sending an unbounded string', async () => {
    await recordContentReport({
      uid: 'user-1',
      seedId: 'seed-1',
      revision: 2,
      category: 'technical',
      detail: 'ا'.repeat(5000),
    });

    const [item] = await listOutbox();
    expect((item.payload.detail as string).length).toBe(1000);
  });

  // Reflections are private and on-device; nothing here may carry one.
  it('has no field a reflection could travel in', async () => {
    await recordCompletion({ uid: 'user-1', seedId: 'seed-1', revision: 2 });
    const [item] = await listOutbox();

    expect(Object.keys(item.payload)).not.toContain('reflection');
  });
});
