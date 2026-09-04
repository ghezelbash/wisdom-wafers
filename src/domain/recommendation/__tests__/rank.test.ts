import {
  EXPLORATION_FLOOR,
  isEligible,
  rankSeeds,
  scoreSeed,
  WEIGHTS,
  type RankerSignals,
} from '@/domain/recommendation/rank';
import type { Seed } from '@/models/seed';

function seed(overrides: Partial<Seed> = {}): Seed {
  return {
    id: 'seed-1',
    schemaVersion: 1,
    revision: 1,
    topicId: 'astronomy',
    title: 'عنوان',
    promise: 'وعده',
    difficulty: 'intro',
    estimatedMinutes: 5,
    blocks: [{ id: 'b1', type: 'richText', paragraphs: ['متن'] }],
    sources: [
      {
        id: 's1',
        title: 'منبع',
        publisher: 'ناشر',
        year: 1400,
        era: 'sh',
        kind: 'کتاب',
      },
    ],
    lastReviewedAt: '2026-09-01T00:00:00.000Z',
    reviewedBy: 'تحریریه',
    ...overrides,
  } as Seed;
}

const signals: RankerSignals = {
  interests: ['astronomy'],
  inProgress: [],
  reviewDue: [],
  completed: [],
  paceMinutes: 10,
  preferredDifficulty: 'intro',
  now: '2026-09-03T00:00:00.000Z',
  locale: 'fa-IR',
};

describe('hard filters', () => {
  it('drops a seed this build cannot render', () => {
    expect(isEligible(seed(), { ...signals, blocked: ['seed-1'] })).toBe(false);
  });

  it('drops a seed with no blocks', () => {
    expect(isEligible(seed({ blocks: [] }), signals)).toBe(false);
  });

  it('keeps an ordinary seed', () => {
    expect(isEligible(seed(), signals)).toBe(true);
  });
});

describe('scoring', () => {
  it('weights a chosen topic most heavily', () => {
    const chosen = scoreSeed(seed(), signals);
    const other = scoreSeed(seed({ topicId: 'history' }), signals);

    expect(chosen.parts.interestAffinity).toBe(WEIGHTS.interestAffinity);
    expect(other.parts.interestAffinity).toBe(0);
    expect(chosen.score).toBeGreaterThan(other.score);
  });

  it('rewards a half-finished seed', () => {
    const resumed = scoreSeed(seed(), { ...signals, inProgress: ['seed-1'] });
    expect(resumed.parts.continuation).toBe(WEIGHTS.continuation);
  });

  it('penalises something already finished', () => {
    const done = scoreSeed(seed(), { ...signals, completed: ['seed-1'] });
    expect(done.parts.repetition).toBeLessThan(0);
    expect(done.score).toBeLessThan(scoreSeed(seed(), signals).score);
  });

  it('only counts format fit when it fits the reader\'s time', () => {
    expect(scoreSeed(seed({ estimatedMinutes: 30 }), signals).parts.formatFit).toBe(0);
    expect(scoreSeed(seed({ estimatedMinutes: 4 }), signals).parts.formatFit).toBe(
      WEIGHTS.formatFit
    );
  });

  it('scores an adjacent difficulty above a distant one', () => {
    const medium = scoreSeed(seed({ difficulty: 'medium' }), signals);
    const advanced = scoreSeed(seed({ difficulty: 'advanced' }), signals);
    expect(medium.parts.difficultyFit).toBeGreaterThan(advanced.parts.difficultyFit);
  });

  it('fades freshness with age rather than cutting it off', () => {
    const recent = scoreSeed(seed(), signals).parts.freshness;
    const old = scoreSeed(seed({ lastReviewedAt: '2024-01-01T00:00:00.000Z' }), signals)
      .parts.freshness;
    expect(recent).toBeGreaterThan(old);
  });

  it('rewards a sourced seed over an unsourced one', () => {
    expect(scoreSeed(seed({ sources: [] }), signals).parts.editorialQuality).toBe(0);
  });
});

describe('reasons', () => {
  // Every reason has to be true by construction: it names the component that
  // actually moved the score.
  it('names the strongest contributor', () => {
    expect(scoreSeed(seed(), signals).reason).toBe('interest');
    expect(scoreSeed(seed({ topicId: 'history' }), { ...signals, reviewDue: ['seed-1'] }).reason).toBe(
      'review'
    );
    expect(
      scoreSeed(seed({ topicId: 'history' }), { ...signals, inProgress: ['seed-1'] }).reason
    ).toBe('continuation');
  });

  it('says nothing when nothing stood out', () => {
    const bare = scoreSeed(
      seed({ topicId: 'history', estimatedMinutes: 40, sources: [], lastReviewedAt: '2000-01-01T00:00:00.000Z' }),
      { ...signals, preferredDifficulty: 'advanced' }
    );
    expect(bare.reason).toBeUndefined();
  });
});

describe('ranking a feed', () => {
  const candidates = [
    seed({ id: 'a', topicId: 'astronomy' }),
    seed({ id: 'b', topicId: 'astronomy' }),
    seed({ id: 'c', topicId: 'astronomy' }),
    seed({ id: 'd', topicId: 'history' }),
    seed({ id: 'e', topicId: 'philosophy' }),
  ];

  it('is deterministic', () => {
    const first = rankSeeds(candidates, signals).map((item) => item.seed.id);
    const second = rankSeeds(candidates, signals).map((item) => item.seed.id);
    expect(first).toEqual(second);
  });

  it('puts the reader\'s topic first', () => {
    expect(rankSeeds(candidates, signals)[0].seed.topicId).toBe('astronomy');
  });

  it('leaves room for topics they did not choose', () => {
    const ranked = rankSeeds(candidates, signals, 5);
    const unfamiliar = ranked.filter((item) => !signals.interests.includes(item.seed.topicId));

    expect(unfamiliar.length).toBeGreaterThanOrEqual(Math.round(5 * EXPLORATION_FLOOR));
  });

  // The case that actually needs the reservation: the reader's own topic could
  // fill every slot on score alone.
  it('reserves exploration even when one topic would win every slot', () => {
    const dominated = [
      ...Array.from({ length: 8 }, (_, index) => seed({ id: `astro-${index}`, topicId: 'astronomy' })),
      seed({ id: 'other-1', topicId: 'history' }),
      seed({ id: 'other-2', topicId: 'philosophy' }),
    ];

    const ranked = rankSeeds(dominated, signals, 6);
    const explored = ranked.filter((item) => item.reason === 'explore');

    expect(explored.length).toBeGreaterThanOrEqual(1);
    expect(explored.every((item) => !signals.interests.includes(item.seed.topicId))).toBe(true);
  });

  it('spends the reservation back on ranking when nothing unfamiliar exists', () => {
    const onlyInterest = Array.from({ length: 4 }, (_, index) =>
      seed({ id: `astro-${index}`, topicId: 'astronomy' })
    );

    expect(rankSeeds(onlyInterest, signals, 4)).toHaveLength(4);
  });

  it('never exceeds the requested size', () => {
    expect(rankSeeds(candidates, signals, 3)).toHaveLength(3);
  });

  it('drops ineligible seeds before scoring', () => {
    const ranked = rankSeeds(candidates, { ...signals, blocked: ['a', 'b'] });
    expect(ranked.map((item) => item.seed.id)).not.toContain('a');
    expect(ranked.map((item) => item.seed.id)).not.toContain('b');
  });
});
