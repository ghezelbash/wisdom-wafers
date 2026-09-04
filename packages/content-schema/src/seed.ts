import { z } from 'zod';

import { KnownBlockSchema, LenientBlockSchema } from './blocks';

/**
 * The domain shape the app renders. The published bundle (see `bundle.ts`) is
 * the wire format; these two are mapped explicitly rather than being assumed to
 * be the same thing.
 */

export const SCHEMA_VERSION = 1;

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expected an ISO timestamp' });

export const LocaleSchema = z.enum(['fa-IR', 'en']);
export const DifficultySchema = z.enum(['intro', 'medium', 'advanced']);
export const TopicFamilySchema = z.enum(['sciences', 'humanities', 'practical']);

/** ≥ 1 to publish, each with publisher, date, era marker and type. */
export const SourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  publisher: z.string().min(1).max(160),
  year: z.number().int().min(1).max(2200),
  /** Gregorian or Hijri Shamsi — a foreign year without its era is ambiguous. */
  era: z.enum(['ce', 'sh']),
  kind: z.string().min(1).max(60),
  url: z.string().url().optional(),
  /** Latin script, so the renderer isolates it inside the RTL layout. */
  latin: z.boolean().optional(),
});

/** What the scheduler asks back on review day. */
export const RecallItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(200),
  answer: z.string().min(1).max(400),
});

const seedShape = {
  id: z.string().min(1).max(64),
  schemaVersion: z.number().int().positive(),
  /** Immutable per publish; progress is keyed on it. */
  revision: z.number().int().positive(),
  topicId: z.string().min(1).max(64),
  title: z.string().min(1).max(60),
  /** The learning promise — required to publish, one line. */
  promise: z.string().min(1).max(80),
  difficulty: DifficultySchema,
  estimatedMinutes: z.number().int().min(1).max(60),
  sources: z.array(SourceSchema),
  lastReviewedAt: isoDateTime,
  reviewedBy: z.string().min(1).max(120),
  recall: z.array(RecallItemSchema).optional(),
  bundled: z.boolean().optional(),
};

/** Publish gate: every block type must be known, and at least one source. */
export const SeedStrictSchema = z.object({
  ...seedShape,
  blocks: z.array(KnownBlockSchema).min(1),
  sources: z.array(SourceSchema).min(1),
});

/** Client: unknown block types survive so the registry can fall back. */
export const SeedLenientSchema = z.object({
  ...seedShape,
  blocks: z.array(LenientBlockSchema).min(1),
});

export type Seed = z.infer<typeof SeedLenientSchema>;
export type StrictSeed = z.infer<typeof SeedStrictSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type RecallItem = z.infer<typeof RecallItemSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Locale = z.infer<typeof LocaleSchema>;
export type TopicFamily = z.infer<typeof TopicFamilySchema>;

export const TopicSchema = z.object({
  id: z.string().min(1).max(64),
  /** ≤ 14 characters or the chip wraps. */
  title: z.string().min(1).max(14).optional(),
  labelKey: z.string().min(1).optional(),
  family: TopicFamilySchema,
  status: z.enum(['draft', 'published']).default('published'),
});

export const PathSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
  seedIds: z.array(z.string().min(1)).min(2),
  topicIds: z.array(z.string().min(1)).min(1),
  status: z.enum(['draft', 'published']).default('published'),
});

export type Topic = z.infer<typeof TopicSchema>;
export type LearningPath = z.infer<typeof PathSchema>;
