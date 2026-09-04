import type { AnyBlock, Seed } from '@/models/seed';
import type { BlockAnswer } from '@/lib/progress-store';

/** In-progress input for the block on screen, before it is submitted. */
export interface Draft {
  selected?: string[];
  bool?: boolean;
  order?: string[];
  /** concept id → description text */
  pairs?: Record<string, string>;
}

/**
 * What every block view receives.
 *
 * Blocks are presentational: the player owns grading, the footer CTA and
 * persistence, so a new block type is one file and one registry entry.
 */
export interface BlockViewProps<B extends AnyBlock = AnyBlock> {
  block: B;
  seed: Seed;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  /** Set once the block has been submitted. */
  answer?: BlockAnswer;
  onRetry: () => void;
  onOpenSources: (sourceId?: string) => void;
  reflection: string;
  onReflectionChange: (text: string) => void;
}
