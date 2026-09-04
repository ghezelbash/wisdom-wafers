/**
 * The app's view of the content contract.
 *
 * The schema itself lives in `packages/content-schema` so the publish pipeline,
 * the CMS and the app all validate against one definition. This module is the
 * app-facing surface of it, plus the aliases the screens already use.
 */
import { BLOCK_TYPES } from '@dananeh/content-schema';

export type {
  AnyBlock,
  BlockType,
  CalloutBlock,
  ChoiceOption,
  Difficulty,
  ImageBlock,
  LearningPath,
  Locale,
  MatchPairsBlock,
  MultipleChoiceBlock,
  MultiSelectBlock,
  OrderingBlock,
  ParseResult,
  ProgressEvent,
  QuoteBlock,
  RecallItem,
  ReflectionBlock,
  RichTextBlock,
  Seed,
  SeedBlock,
  SeedBundle,
  Source,
  SummaryBlock,
  TrueFalseBlock,
  UnknownBlock,
} from '@dananeh/content-schema';

export {
  ASSESSED_BLOCK_TYPES as ASSESSED_TYPES,
  BLOCK_TYPES,
  bundleToSeed,
  computeChecksum,
  isKnownBlock,
  parseBundleLenient,
  parseBundleStrict,
  parseSeedLenient,
  parseSeedStrict,
  SCHEMA_VERSION as SEED_SCHEMA_VERSION,
  seedToBundle,
  verifyChecksum,
} from '@dananeh/content-schema';

/** Kept for call sites that test membership rather than iterate. */
export const KNOWN_BLOCK_TYPES = new Set<string>(BLOCK_TYPES);
