import { z } from 'zod';

/**
 * A progress event (§6.5).
 *
 * `id` is the idempotency key: the outbox may retry, and the ingest Function
 * deduplicates on it, so a flaky network can never double-count a completion.
 */
export const ProgressEventSchema = z.object({
  id: z.string().min(8).max(64),
  uid: z.string().min(1),
  seedId: z.string().min(1),
  revision: z.number().int().positive(),
  type: z.enum(['started', 'block_viewed', 'answered', 'completed', 'reviewed']),
  blockId: z.string().optional(),
  /**
   * The reader's position when this happened.
   *
   * Carried on the event rather than written to the document by the client,
   * because progress is server-authoritative. It is what lets a second device
   * open a seed where the first one left off.
   */
  blockIndex: z.number().int().min(0).max(500).optional(),
  /** Never free text from the reader: reflections stay on the device. */
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  correct: z.boolean().optional(),
  confidence: z.enum(['easy', 'good', 'hard', 'again']).optional(),
  occurredAtDevice: z.string(),
  timezone: z.string(),
  appVersion: z.string(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/**
 * @deprecated The progress document is server-authoritative — see
 * `ProgressDocSchema` in `sync.ts`. Kept only until the last reference goes.
 */
export const SeedProgressDocSchema = z.object({
  seedId: z.string().min(1),
  revision: z.number().int().positive(),
  percent: z.number().min(0).max(100),
  blockIndex: z.number().int().min(0),
  status: z.enum(['in_progress', 'completed']),
  updatedAt: z.string(),
});

export type SeedProgressDoc = z.infer<typeof SeedProgressDocSchema>;
