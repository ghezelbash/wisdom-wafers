import type { BlockAnswer } from '@/lib/progress-store';
import type { SeedBlock } from '@/models/seed';

import type { Draft } from './types';

export interface Grade {
  correct: boolean;
  /** Some of the answer was right. Partial credit is its own state. */
  partial: boolean;
  /** For multi-select feedback: «۱ از ۲ مورد». */
  hits?: number;
  expected?: number;
}

/** Pure grading, so the rules can be read — and tested — without a renderer. */
export function grade(block: SeedBlock, draft: Draft): Grade {
  switch (block.type) {
    case 'multipleChoice': {
      const picked = draft.selected?.[0];
      const correct = block.options.some((option) => option.id === picked && option.isCorrect);
      return { correct, partial: false };
    }

    case 'multiSelect': {
      const selected = new Set(draft.selected ?? []);
      const expected = block.options.filter((option) => option.isCorrect);
      const hits = expected.filter((option) => selected.has(option.id)).length;
      const wrong = [...selected].filter(
        (id) => !block.options.find((option) => option.id === id)?.isCorrect
      ).length;
      const correct = hits === expected.length && wrong === 0;
      return { correct, partial: !correct && hits > 0, hits, expected: expected.length };
    }

    case 'trueFalse':
      return { correct: draft.bool === block.answer, partial: false };

    case 'ordering': {
      const expected = block.items.map((item) => item.id);
      const given = draft.order ?? [];
      const correct =
        given.length === expected.length && given.every((id, index) => id === expected[index]);
      const hits = given.filter((id, index) => id === expected[index]).length;
      return { correct, partial: !correct && hits > 0, hits, expected: expected.length };
    }

    case 'matchPairs': {
      const given = draft.pairs ?? {};
      const hits = block.pairs.filter((pair) => given[pair.id] === pair.description).length;
      const correct = hits === block.pairs.length;
      return { correct, partial: !correct && hits > 0, hits, expected: block.pairs.length };
    }

    default:
      return { correct: true, partial: false };
  }
}

export function toAnswer(blockId: string, draft: Draft, result: Grade, attempts: number): BlockAnswer {
  return {
    blockId,
    correct: result.correct,
    partial: result.partial,
    attempts,
    selected: draft.selected,
    order: draft.order,
    pairs: draft.pairs,
    answeredBool: draft.bool,
  };
}

/**
 * A deterministic scramble for ordering items, seeded by the block id so the
 * presented order is stable across reloads but never the stored answer.
 */
export function scramble<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  const hash = (value: string) => {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 100003;
    return h;
  };
  return [...items].sort((a, b) => hash(seed + key(a)) - hash(seed + key(b)));
}
