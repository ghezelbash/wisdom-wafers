import { __resetImpressions, recordImpression } from '@/platform/analytics/impression';
import { setAnalyticsSink } from '@/platform/analytics';

/**
 * An impression that inflates with restlessness measures the reader's
 * scrolling, not the card — and every ratio built on it (click-through, the
 * usefulness of a reason code, the saturation penalty) is then wrong in a way
 * nobody can see from the number alone.
 */

const sent: { name: string; params: Record<string, unknown> }[] = [];

beforeEach(() => {
  sent.length = 0;
  __resetImpressions();
  setAnalyticsSink({ track: (name, params) => sent.push({ name, params }) });
});

const card = (overrides: Partial<Parameters<typeof recordImpression>[0]> = {}) => ({
  seedId: 'seed-anchoring',
  revision: 1,
  placement: 'home_rail' as const,
  rank: 3,
  ...overrides,
});

describe('counting a card', () => {
  it('sends the placement and the position, which is the whole point', () => {
    recordImpression(card());

    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({
      seed_id: 'seed-anchoring',
      revision: 1,
      placement: 'home_rail',
      rank: 3,
    });
  });

  it('counts it once however many times it renders', () => {
    recordImpression(card());
    recordImpression(card());
    recordImpression(card({ rank: 4 }));

    expect(sent).toHaveLength(1);
  });

  /** The comparison the placement parameter exists to make. */
  it('counts the same seed again in a different placement', () => {
    recordImpression(card());
    recordImpression(card({ placement: 'search' }));

    expect(sent.map((event) => event.params.placement)).toEqual(['home_rail', 'search']);
  });

  it('carries the reason when the card gave one, and omits it otherwise', () => {
    recordImpression(card({ reasonCode: 'topic_match' }));
    recordImpression(card({ placement: 'search' }));

    expect(sent[0].params.reason_code).toBe('topic_match');
    expect(sent[1].params).not.toHaveProperty('reason_code');
  });

  it('does nothing at all for a card with no seed', () => {
    recordImpression(null);
    expect(sent).toHaveLength(0);
  });
});
