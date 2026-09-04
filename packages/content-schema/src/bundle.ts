import { z } from 'zod';

import { KnownBlockSchema, LenientBlockSchema } from './blocks';
import {
  DifficultySchema,
  LocaleSchema,
  RecallItemSchema,
  SCHEMA_VERSION,
  SourceSchema,
  type Seed,
} from './seed';

/**
 * The published bundle — the wire format from the blueprint §6.2.
 *
 * One immutable artifact per revision, fetched once and cached, instead of a
 * Firestore read per block. It carries its own checksum so a partial or
 * tampered download is detectable on device.
 */

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expected an ISO timestamp' });

const bundleShape = {
  schemaVersion: z.number().int().positive(),
  seedId: z.string().min(1).max(64),
  revision: z.number().int().positive(),
  locale: LocaleSchema,
  title: z.string().min(1).max(60),
  /** The learning promise, named `objective` on the wire. */
  objective: z.string().min(1).max(80),
  topicId: z.string().min(1).max(64),
  estimatedMinutes: z.number().int().min(1).max(60),
  /** 1–5 on the wire; the app maps it onto three named levels. */
  difficulty: z.number().int().min(1).max(5),
  summary: z.array(z.string().min(1).max(90)),
  reviewItems: z.array(RecallItemSchema),
  sources: z.array(SourceSchema),
  accessibility: z.object({
    transcript: z.string().optional(),
    altTextComplete: z.boolean(),
  }),
  lastReviewedAt: isoDateTime,
  reviewedBy: z.string().min(1).max(120),
  checksum: z.string().length(64),
  publishedAt: isoDateTime,
};

/**
 * The publish gate.
 *
 * Rejects unknown block types, incomplete alt text and a summary that is not
 * exactly three points — the three failures that would otherwise reach a reader
 * as a broken screen or a review with nothing to ask.
 */
export const SeedBundleStrictSchema = z
  .object({
    ...bundleShape,
    blocks: z.array(KnownBlockSchema).min(1),
    sources: z.array(SourceSchema).min(1),
    summary: z.tuple([
      z.string().min(1).max(90),
      z.string().min(1).max(90),
      z.string().min(1).max(90),
    ]),
    accessibility: z.object({
      transcript: z.string().optional(),
      altTextComplete: z.literal(true),
    }),
  })
  .refine(
    (bundle) => bundle.blocks.every((block) => block.type !== 'image' || block.alt.length > 0),
    { message: 'every image needs alt text', path: ['blocks'] }
  )
  .refine(
    (bundle) =>
      bundle.blocks.every(
        (block) => block.type !== 'image' || !!block.imageUrl || block.describedOnly === true
      ),
    {
      // An image block with neither is what shipped an empty frame carrying alt
      // text — indistinguishable from an asset that failed to load.
      message: 'an image block needs a picture, or must declare itself described-only',
      path: ['blocks'],
    }
  )
  .refine((bundle) => bundle.reviewItems.length >= 1, {
    message: 'a published seed needs at least one review item',
    path: ['reviewItems'],
  });

/** What a client accepts: newer block types degrade to the named fallback. */
export const SeedBundleLenientSchema = z.object({
  ...bundleShape,
  blocks: z.array(LenientBlockSchema).min(1),
});

export type SeedBundle = z.infer<typeof SeedBundleLenientSchema>;
export type StrictSeedBundle = z.infer<typeof SeedBundleStrictSchema>;

const DIFFICULTY_TO_LEVEL = ['intro', 'intro', 'medium', 'advanced', 'advanced'] as const;
const LEVEL_TO_DIFFICULTY = { intro: 2, medium: 3, advanced: 4 } as const;

export const difficultyToLevel = (value: number) =>
  DIFFICULTY_TO_LEVEL[Math.min(5, Math.max(1, value)) - 1];

export const levelToDifficulty = (level: z.infer<typeof DifficultySchema>) =>
  LEVEL_TO_DIFFICULTY[level];

/** Wire → domain. The app never sees the bundle shape directly. */
export function bundleToSeed(bundle: SeedBundle): Seed {
  return {
    id: bundle.seedId,
    schemaVersion: bundle.schemaVersion,
    revision: bundle.revision,
    topicId: bundle.topicId,
    title: bundle.title,
    promise: bundle.objective,
    difficulty: difficultyToLevel(bundle.difficulty),
    estimatedMinutes: bundle.estimatedMinutes,
    blocks: bundle.blocks,
    sources: bundle.sources,
    lastReviewedAt: bundle.lastReviewedAt,
    reviewedBy: bundle.reviewedBy,
    recall: bundle.reviewItems.length ? bundle.reviewItems : undefined,
  };
}

/**
 * Domain → wire, for the publish pipeline and for fixtures that are authored in
 * the app's shape. The checksum is computed last, over everything else.
 */
export function seedToBundle(
  seed: Seed,
  options: { locale?: z.infer<typeof LocaleSchema>; publishedAt?: string } = {}
): SeedBundle {
  const summaryBlock = seed.blocks.find((block) => block.type === 'summary') as
    | { points: string[] }
    | undefined;

  const draft = {
    schemaVersion: seed.schemaVersion ?? SCHEMA_VERSION,
    seedId: seed.id,
    revision: seed.revision,
    locale: options.locale ?? ('fa-IR' as const),
    title: seed.title,
    objective: seed.promise,
    topicId: seed.topicId,
    estimatedMinutes: seed.estimatedMinutes,
    difficulty: levelToDifficulty(seed.difficulty),
    blocks: seed.blocks,
    summary: summaryBlock?.points ?? [],
    reviewItems: seed.recall ?? [],
    sources: seed.sources,
    accessibility: {
      altTextComplete: seed.blocks.every(
        (block) => block.type !== 'image' || ((block as { alt?: string }).alt ?? '').length > 0
      ),
    },
    lastReviewedAt: seed.lastReviewedAt,
    reviewedBy: seed.reviewedBy,
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    checksum: '',
  };

  return draft as SeedBundle;
}
