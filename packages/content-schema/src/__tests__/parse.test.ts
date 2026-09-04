import { bundleToSeed, difficultyToLevel, levelToDifficulty } from '../bundle';
import { computeChecksum } from '../checksum';
import { parseBundleLenient, parseBundleStrict, parseSeedLenient, parseSeedStrict } from '../parse';
import { SCHEMA_VERSION } from '../seed';

const source = {
  id: 'src-1',
  title: 'Olbers’ paradox',
  publisher: 'cambridge.org',
  year: 1987,
  era: 'ce' as const,
  kind: 'مقاله‌ی مروری',
  latin: true,
};

const blocks = [
  { id: 'b1', type: 'richText' as const, paragraphs: ['فرض کن جهان بی‌کران است.'] },
  {
    id: 'b2',
    type: 'image' as const,
    alt: 'نمودار خطوط دید در جهان بی‌کران',
    aspect: '4:5' as const,
  },
  {
    id: 'b3',
    type: 'summary' as const,
    points: ['نکته‌ی یک.', 'نکته‌ی دو.', 'نکته‌ی سه.'] as [string, string, string],
  },
];

function makeBundle(overrides: Record<string, unknown> = {}) {
  const draft = {
    schemaVersion: SCHEMA_VERSION,
    seedId: 'seed-1',
    revision: 1,
    locale: 'fa-IR',
    title: 'چرا آسمان شب تاریک است؟',
    objective: 'می‌فهمی تاریکی آسمان چه می‌گوید.',
    topicId: 'astronomy',
    estimatedMinutes: 6,
    difficulty: 2,
    blocks,
    summary: ['نکته‌ی یک.', 'نکته‌ی دو.', 'نکته‌ی سه.'],
    reviewItems: [{ id: 'r1', prompt: 'چه چیزی را نشان می‌دهد؟', answer: 'سنّ محدود جهان.' }],
    sources: [source],
    accessibility: { altTextComplete: true },
    lastReviewedAt: '2026-08-20T00:00:00.000Z',
    reviewedBy: 'تحریریه‌ی دانانه',
    publishedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
  return { ...draft, checksum: computeChecksum(draft) };
}

describe('the publish gate', () => {
  it('accepts a complete bundle', () => {
    expect(parseBundleStrict(makeBundle()).ok).toBe(true);
  });

  it('rejects an image with no alt text', () => {
    const bundle = makeBundle({
      blocks: [blocks[0], { id: 'b2', type: 'image', alt: '', aspect: '4:5' }, blocks[2]],
    });
    const result = parseBundleStrict(bundle);
    expect(result.ok).toBe(false);
  });

  it('rejects an incomplete accessibility flag', () => {
    expect(parseBundleStrict(makeBundle({ accessibility: { altTextComplete: false } })).ok).toBe(
      false
    );
  });

  it('rejects a summary that is not exactly three points', () => {
    expect(parseBundleStrict(makeBundle({ summary: ['یک.', 'دو.'] })).ok).toBe(false);
    expect(
      parseBundleStrict(makeBundle({ summary: ['یک.', 'دو.', 'سه.', 'چهار.'] })).ok
    ).toBe(false);
  });

  it('rejects a bundle with no sources', () => {
    expect(parseBundleStrict(makeBundle({ sources: [] })).ok).toBe(false);
  });

  it('rejects a bundle with nothing to review', () => {
    expect(parseBundleStrict(makeBundle({ reviewItems: [] })).ok).toBe(false);
  });

  it('rejects a block type it does not know', () => {
    const result = parseBundleStrict(
      makeBundle({ blocks: [...blocks, { id: 'b4', type: 'starMap3d' }] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it('reports issues with a readable path', () => {
    const result = parseBundleStrict(makeBundle({ title: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.path === 'title')).toBe(true);
  });
});

describe('the client parser', () => {
  // Content can be newer than the build reading it; a seed must not be lost to
  // one block type this version has never heard of.
  it('keeps an unknown block instead of failing the whole bundle', () => {
    const result = parseBundleLenient(
      makeBundle({ blocks: [...blocks, { id: 'b4', type: 'starMap3d', payload: { zoom: 2 } }] })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocks).toHaveLength(4);
      expect(result.value.blocks[3].type).toBe('starMap3d');
    }
  });

  it('accepts a bundle from a newer schema version', () => {
    expect(parseBundleLenient(makeBundle({ schemaVersion: SCHEMA_VERSION + 1 })).ok).toBe(true);
  });

  it('still rejects structurally broken content', () => {
    expect(parseBundleLenient(makeBundle({ blocks: [] })).ok).toBe(false);
    expect(parseBundleLenient(makeBundle({ revision: 0 })).ok).toBe(false);
  });
});

describe('wire ↔ domain mapping', () => {
  it('maps the numeric difficulty onto the three named levels', () => {
    expect(difficultyToLevel(1)).toBe('intro');
    expect(difficultyToLevel(3)).toBe('medium');
    expect(difficultyToLevel(5)).toBe('advanced');
    expect(levelToDifficulty('medium')).toBe(3);
    expect(difficultyToLevel(levelToDifficulty('advanced'))).toBe('advanced');
  });

  it('turns a bundle into the shape the app renders', () => {
    const bundle = makeBundle();
    const seed = bundleToSeed(bundle as never);

    expect(seed.id).toBe('seed-1');
    expect(seed.promise).toBe(bundle.objective);
    expect(seed.difficulty).toBe('intro');
    expect(seed.recall).toHaveLength(1);
    expect(parseSeedLenient(seed).ok).toBe(true);
    expect(parseSeedStrict(seed).ok).toBe(true);
  });
});
