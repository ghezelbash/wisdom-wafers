import { z } from 'zod';

/**
 * The sync contract.
 *
 * What a device and an account agree about, in one place, so the client, the
 * ingest Function and the security rules cannot each hold a slightly different
 * idea of what a document contains.
 *
 * Every field is either **server-authoritative** — derived from events, never
 * written by a client — or **mergeable**, with a stated rule for what happens
 * when two devices disagree. There is no third category; a field nobody has
 * decided about is a field that silently loses data on the second device.
 *
 * | document | field | owner | conflict |
 * |---|---|---|---|
 * | `users/{uid}` | preferences | client | newest `updatedAt` wins, whole set |
 * | `users/{uid}/progress/{seedId}` | status, completedAt | **server** | monotonic — never un-completes |
 * | | blockIndex | **server** | furthest within a revision |
 * | | revision | **server** | newer revision replaces outright |
 * | `users/{uid}/saved/{seedId}` | saved | client | newest `updatedAt` wins, per seed |
 * | `users/{uid}/reviews/{seedId}` | interval, dueAt, count | **server** | derived from the event; count is the larger |
 *
 * Preferences are merged as a *set* rather than field by field: they are
 * choices a reader made in one sitting, and mixing two sittings produces a
 * combination nobody picked.
 */

export const SYNC_SCHEMA_VERSION = 1;

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expected an ISO timestamp' });

// ------------------------------------------------------------------ reviews

export const ConfidenceSchema = z.enum(['easy', 'good', 'hard', 'again']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * How long a rating buys.
 *
 * Shared rather than duplicated: the app states the interval on the button the
 * reader presses, and the server writes the due date. Two copies of this table
 * would let the app promise one thing and the schedule do another.
 */
export const INTERVAL_DAYS: Record<Confidence, number> = {
  easy: 14,
  good: 7,
  hard: 3,
  again: 1,
};

/** The first ask after finishing, before any rating exists. */
export const FIRST_REVIEW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export const intervalForConfidence = (confidence: Confidence): number =>
  INTERVAL_DAYS[confidence] ?? INTERVAL_DAYS.good;

/** When a seed rated `confidence` at `reviewedAt` comes back. */
export function nextDueAt(reviewedAt: string, confidence: Confidence): string {
  const from = Date.parse(reviewedAt);
  const base = Number.isNaN(from) ? Date.now() : from;
  return new Date(base + intervalForConfidence(confidence) * DAY_MS).toISOString();
}

/**
 * Review state for one seed. Server-authoritative: a client records the
 * attempt through an event, and the schedule is derived here.
 */
export const ReviewDocSchema = z.object({
  seedId: z.string().min(1).max(64),
  reviewedAt: isoDateTime,
  /** Days bought by the last rating. */
  interval: z.number().int().min(1).max(365),
  dueAt: isoDateTime,
  /** How many times this seed has been reviewed, across every device. */
  count: z.number().int().min(0),
  confidence: ConfidenceSchema,
  updatedAt: isoDateTime,
});

export type ReviewDoc = z.infer<typeof ReviewDocSchema>;

// ------------------------------------------------------------------- saved

/**
 * A bookmark, as a document rather than a presence.
 *
 * Un-saving has to travel, and a deleted document says nothing to a device that
 * never saw it exist. So a removal is a document with `saved: false` and a
 * timestamp, and the newer timestamp wins per seed. Deleting the row instead
 * would make un-saving silently fail to reach a second device.
 */
export const SavedDocSchema = z.object({
  seedId: z.string().min(1).max(64),
  saved: z.boolean(),
  updatedAt: isoDateTime,
});

export type SavedDoc = z.infer<typeof SavedDocSchema>;

// ------------------------------------------------------------- preferences

export const NotificationPreferencesSchema = z.object({
  pace: z.enum(['one', 'two', 'whenever']).nullable(),
  timeOfDay: z.enum(['morning', 'evening', 'night']).nullable(),
  /** 24h `HH:MM`. */
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  enabled: z.boolean(),
});

/** What a client may write to `users/{uid}`. The rules enforce the same list. */
export const PreferencesSchema = z.object({
  locale: z.enum(['fa-IR', 'en']),
  timezone: z.string().min(1).max(64),
  interests: z.array(z.string().min(1).max(64)).max(20),
  notificationPreferences: NotificationPreferencesSchema,
  updatedAt: isoDateTime,
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const PREFERENCE_KEYS = [
  'locale',
  'timezone',
  'interests',
  'notificationPreferences',
  'updatedAt',
] as const;

// --------------------------------------------------------------- progress

/**
 * Server-authoritative progress.
 *
 * `blockIndex` is the resume position, and it is the reason a second device can
 * open a seed where the first one left off. It only ever moves forward within a
 * revision — a stale event arriving late must not drag a reader backwards.
 */
export const ProgressDocSchema = z.object({
  seedId: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  status: z.enum(['in_progress', 'completed']),
  percent: z.number().min(0).max(100),
  blockIndex: z.number().int().min(0).max(500),
  updatedAt: isoDateTime,
  completedAt: isoDateTime.optional(),
});

export type ProgressDoc = z.infer<typeof ProgressDocSchema>;

/**
 * Whether an incoming position replaces the stored one.
 *
 * Newer revision always wins: the block lists differ, so a position does not
 * carry across. Within a revision, only forward.
 */
export function shouldAdvancePosition(
  stored: { revision: number; blockIndex: number } | undefined,
  incoming: { revision: number; blockIndex: number }
): boolean {
  if (!stored) return true;
  if (incoming.revision !== stored.revision) return incoming.revision > stored.revision;
  return incoming.blockIndex > stored.blockIndex;
}
