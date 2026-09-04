import { z } from 'zod';

/**
 * The eleven MVP block types.
 *
 * Blocks are the one shape shared by the published bundle, the app and the CMS,
 * so they live here rather than in any of the three.
 */

const id = z.string().min(1).max(64);

export const RichTextBlockSchema = z.object({
  id,
  type: z.literal('richText'),
  eyebrow: z.string().max(60).optional(),
  heading: z.string().max(120).optional(),
  paragraphs: z.array(z.string().min(1)).min(1),
});

export const ImageBlockSchema = z.object({
  id,
  type: z.literal('image'),
  imageUrl: z.string().url().optional(),
  /** A publish gate: an image with no alt text cannot be published. */
  alt: z.string().min(1).max(300),
  caption: z.string().max(400).optional(),
  aspect: z.enum(['4:5', '3:2', '16:9']),
});

export const QuoteBlockSchema = z.object({
  id,
  type: z.literal('quote'),
  text: z.string().min(1).max(400),
  attribution: z.string().max(160).optional(),
  period: z.string().max(60).optional(),
});

export const CalloutBlockSchema = z.object({
  id,
  type: z.literal('callout'),
  tone: z.enum(['note', 'misconception']),
  title: z.string().min(1).max(60),
  body: z.string().min(1).max(400),
});

const ChoiceOptionSchema = z.object({
  id,
  /** ≤ 70 characters: longer options stop being scannable. */
  text: z.string().min(1).max(70),
  isCorrect: z.boolean(),
});

/** 120–260 characters: shorter reads as dismissive, longer gets skipped. */
const explanation = z.string().min(1).max(400);
const question = z.string().min(1).max(120);

export const MultipleChoiceBlockSchema = z.object({
  id,
  type: z.literal('multipleChoice'),
  question,
  options: z.array(ChoiceOptionSchema).min(2).max(5),
  explanation,
  sourceId: z.string().optional(),
});

export const MultiSelectBlockSchema = z.object({
  id,
  type: z.literal('multiSelect'),
  question,
  options: z.array(ChoiceOptionSchema).min(3).max(6),
  explanation,
  sourceId: z.string().optional(),
});

export const TrueFalseBlockSchema = z.object({
  id,
  type: z.literal('trueFalse'),
  statement: z.string().min(1).max(160),
  answer: z.boolean(),
  explanation,
  sourceId: z.string().optional(),
});

export const OrderingBlockSchema = z.object({
  id,
  type: z.literal('ordering'),
  prompt: z.string().min(1).max(120),
  /** Stored in the correct order; the player scrambles for presentation. */
  items: z.array(z.object({ id, text: z.string().min(1).max(120) })).min(3).max(6),
  explanation: z.string().max(400).optional(),
});

export const MatchPairsBlockSchema = z.object({
  id,
  type: z.literal('matchPairs'),
  prompt: z.string().min(1).max(120),
  pairs: z
    .array(
      z.object({
        id,
        concept: z.string().min(1).max(60),
        description: z.string().min(1).max(120),
      })
    )
    .min(2)
    .max(5),
  distractors: z.array(z.string().min(1).max(120)).max(3).optional(),
  explanation: z.string().max(400).optional(),
});

export const ReflectionBlockSchema = z.object({
  id,
  type: z.literal('reflection'),
  prompt: z.string().min(1).max(160),
  maxLength: z.number().int().min(80).max(600),
});

export const SummaryBlockSchema = z.object({
  id,
  type: z.literal('summary'),
  /** Exactly three, each ≤ 90 chars and independently recallable — the
   *  scheduler asks them separately. */
  points: z.tuple([
    z.string().min(1).max(90),
    z.string().min(1).max(90),
    z.string().min(1).max(90),
  ]),
});

export const KnownBlockSchema = z.discriminatedUnion('type', [
  RichTextBlockSchema,
  ImageBlockSchema,
  QuoteBlockSchema,
  CalloutBlockSchema,
  MultipleChoiceBlockSchema,
  MultiSelectBlockSchema,
  TrueFalseBlockSchema,
  OrderingBlockSchema,
  MatchPairsBlockSchema,
  ReflectionBlockSchema,
  SummaryBlockSchema,
]);

/**
 * What a client accepts.
 *
 * A block type this build does not know still parses, carrying only `id` and
 * `type`, so the registry can render its named fallback. A client must tolerate
 * content newer than itself; the publish gate must not.
 */
export const UnknownBlockSchema = z
  .object({ id, type: z.string().min(1) })
  .loose();

export const LenientBlockSchema = z.union([KnownBlockSchema, UnknownBlockSchema]);

export type RichTextBlock = z.infer<typeof RichTextBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>;
export type CalloutBlock = z.infer<typeof CalloutBlockSchema>;
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;
export type MultipleChoiceBlock = z.infer<typeof MultipleChoiceBlockSchema>;
export type MultiSelectBlock = z.infer<typeof MultiSelectBlockSchema>;
export type TrueFalseBlock = z.infer<typeof TrueFalseBlockSchema>;
export type OrderingBlock = z.infer<typeof OrderingBlockSchema>;
export type MatchPairsBlock = z.infer<typeof MatchPairsBlockSchema>;
export type ReflectionBlock = z.infer<typeof ReflectionBlockSchema>;
export type SummaryBlock = z.infer<typeof SummaryBlockSchema>;

export type SeedBlock = z.infer<typeof KnownBlockSchema>;
export type UnknownBlock = z.infer<typeof UnknownBlockSchema>;
export type AnyBlock = SeedBlock | UnknownBlock;

export const BLOCK_TYPES = [
  'richText',
  'image',
  'quote',
  'callout',
  'multipleChoice',
  'multiSelect',
  'trueFalse',
  'ordering',
  'matchPairs',
  'reflection',
  'summary',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

const KNOWN = new Set<string>(BLOCK_TYPES);

export const isKnownBlock = (block: AnyBlock): block is SeedBlock => KNOWN.has(block.type);

/** Blocks that ask something of the reader, for correct-answer counts. */
export const ASSESSED_BLOCK_TYPES = new Set<string>([
  'multipleChoice',
  'multiSelect',
  'trueFalse',
  'ordering',
  'matchPairs',
]);
