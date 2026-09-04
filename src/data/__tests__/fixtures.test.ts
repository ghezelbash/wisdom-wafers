import { unknownBlockSeed } from '@/data/__fixtures__/unknown-block-seed';
import { content, LAUNCH_SEEDS } from '@/data/content-repository';
import { PATHS } from '@/data/paths';
import { skyDarknessSeed } from '@/data/seeds/sky-darkness';
import {
  bundleToSeed,
  computeChecksum,
  parseBundleStrict,
  parseSeedLenient,
  parseSeedStrict,
  seedToBundle,
} from '@dananeh/content-schema';

/**
 * The fixtures are the first content this schema has to accept, so they double
 * as the contract's test corpus. If an authored seed stops validating, the
 * publish pipeline would have rejected it too.
 */
describe('the authored seed', () => {
  it('is publishable as it stands', () => {
    const result = parseSeedStrict(skyDarknessSeed);
    if (!result.ok) console.error(result.issues);
    expect(result.ok).toBe(true);
  });

  it('compiles into a bundle that passes the publish gate', () => {
    const draft = seedToBundle(skyDarknessSeed, { publishedAt: '2026-08-21T00:00:00.000Z' });
    const bundle = { ...draft, checksum: computeChecksum({ ...draft, checksum: '' }) };

    const result = parseBundleStrict(bundle);
    if (!result.ok) console.error(result.issues);
    expect(result.ok).toBe(true);
  });

  it('survives a round trip through the wire format', () => {
    const bundle = seedToBundle(skyDarknessSeed);
    const back = bundleToSeed(bundle);

    expect(back.id).toBe(skyDarknessSeed.id);
    expect(back.title).toBe(skyDarknessSeed.title);
    expect(back.promise).toBe(skyDarknessSeed.promise);
    expect(back.difficulty).toBe(skyDarknessSeed.difficulty);
    expect(back.blocks).toHaveLength(skyDarknessSeed.blocks.length);
    expect(back.recall).toEqual(skyDarknessSeed.recall);
  });

  it('exercises every block type, so the registry stays covered', () => {
    const types = new Set(skyDarknessSeed.blocks.map((block) => block.type));
    expect(types).toEqual(
      new Set([
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
      ])
    );
  });
});

describe('the newer-content fixture', () => {
  it('is not publishable by this build — its block type is unknown here', () => {
    expect(parseSeedStrict(unknownBlockSeed).ok).toBe(false);
  });

  it('is still readable by this build, so the fallback can render', () => {
    const result = parseSeedLenient(unknownBlockSeed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocks.map((block) => block.type)).toContain('starMap3d');
    }
  });
});

describe('the launch catalogue', () => {
  it('ships at least three seeds', () => {
    expect(LAUNCH_SEEDS.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * The publish gate, applied to what is in the binary.
   *
   * Anything here is what a reader sees on a first run with no network and
   * whenever a remote refresh fails. It has to clear the same bar published
   * content does — sources, a three-point summary, complete alt text.
   */
  it('passes strict validation, every seed', () => {
    for (const seed of LAUNCH_SEEDS) {
      const result = parseSeedStrict(seed);
      if (!result.ok) console.error(seed.id, result.issues);
      expect(result.ok).toBe(true);
    }
  });

  it('compiles every seed into a bundle the publish gate accepts', () => {
    for (const seed of LAUNCH_SEEDS) {
      const draft = seedToBundle(seed, { publishedAt: '2026-08-31T00:00:00.000Z' });
      const bundle = { ...draft, checksum: computeChecksum({ ...draft, checksum: '' }) };

      const result = parseBundleStrict(bundle);
      if (!result.ok) console.error(seed.id, result.issues);
      expect(result.ok).toBe(true);
    }
  });

  it('gives every seed the metadata a card and a review need', () => {
    for (const seed of LAUNCH_SEEDS) {
      expect(seed.sources.length).toBeGreaterThanOrEqual(1);
      expect(seed.recall?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(seed.estimatedMinutes).toBeGreaterThan(0);
      expect(seed.revision).toBeGreaterThan(0);
      expect(seed.reviewedBy.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(seed.lastReviewedAt))).toBe(false);
    }
  });

  /** A source that points at a publisher's homepage is not a citation. */
  it('cites a specific page, not a publisher homepage', () => {
    for (const seed of LAUNCH_SEEDS) {
      for (const source of seed.sources) {
        if (!source.url) continue;
        const path = new URL(source.url).pathname;
        expect(path.length).toBeGreaterThan(1);
      }
    }
  });

  it('has no test fixture in it', () => {
    const ids = content.listSeeds().map((seed) => seed.id);
    expect(ids).not.toContain(unknownBlockSeed.id);
    expect(ids.some((id) => id.startsWith('lesson-'))).toBe(false);
  });

  it('parses leniently, every seed', () => {
    for (const seed of content.listSeeds()) {
      const result = parseSeedLenient(seed);
      if (!result.ok) console.error(seed.id, result.issues);
      expect(result.ok).toBe(true);
    }
  });

  it('always has a bundled seed to open on a dead network', () => {
    expect(content.getBundledSeed().bundled).toBe(true);
  });

  it('offers no path that points at content this build does not ship', () => {
    const ids = new Set(LAUNCH_SEEDS.map((seed) => seed.id));
    for (const path of PATHS) {
      for (const seedId of path.seedIds) expect(ids).toContain(seedId);
    }
  });

  it('gives every seed a topic the topic list knows', () => {
    const topics = new Set(content.listTopics().map((topic) => topic.id));
    for (const seed of LAUNCH_SEEDS) expect(topics).toContain(seed.topicId);
  });
});
