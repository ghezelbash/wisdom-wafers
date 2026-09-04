import {
  getAnalyticsContext,
  setAnalyticsContext,
  setAnalyticsSink,
  track,
} from '@/platform/analytics';
import { validateParams } from '@/platform/analytics/events';

describe('the PII guard', () => {
  it('passes identifiers, counts and flags', () => {
    expect(validateParams({ seed_id: 'seed-sky-darkness', rank: 2, correct: true })).toEqual([]);
  });

  // The four usual leaks: addresses, search terms, titles, free text.
  it('refuses a parameter whose name invites free text', () => {
    expect(validateParams({ email: 'a@b.com' })[0]).toMatchObject({ reason: 'forbidden-key' });
    expect(validateParams({ query: 'آسمان' })[0]).toMatchObject({ reason: 'forbidden-key' });
    expect(validateParams({ seed_title: 'چرا آسمان' })[0]).toMatchObject({
      reason: 'forbidden-key',
    });
    expect(validateParams({ reflection: 'هرچه' })[0]).toMatchObject({ reason: 'forbidden-key' });
  });

  it('refuses a value that looks personal even under an innocent name', () => {
    expect(validateParams({ source: 'reader@example.com' })[0]).toMatchObject({
      reason: 'looks-personal',
    });
    expect(validateParams({ source: 'https://example.com/x' })[0]).toMatchObject({
      reason: 'looks-personal',
    });
    expect(validateParams({ source: 'این یک جمله‌ی کامل فارسی است' })[0]).toMatchObject({
      reason: 'looks-personal',
    });
  });

  it('refuses anything that is not a scalar', () => {
    expect(validateParams({ payload: { nested: true } })[0]).toMatchObject({
      reason: 'unsupported-type',
    });
  });

  it('ignores absent values rather than flagging them', () => {
    expect(validateParams({ reason_code: undefined, rank: 1 })).toEqual([]);
  });
});

describe('track', () => {
  const sent: { name: string; params: Record<string, unknown> }[] = [];

  beforeEach(() => {
    sent.length = 0;
    setAnalyticsSink({ track: (name, params) => sent.push({ name, params }) });
  });

  it('sends a valid event with the ambient context attached', () => {
    setAnalyticsContext({ online: true, route: '/seed' });
    track('seed_started', { seed_id: 'seed-1', revision: 4, source: 'home_hero', online: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({ seed_id: 'seed-1', route: '/seed', online: true });
  });

  it('drops an event whose parameters would leak, rather than sanitising it', () => {
    // Sanitising invites "close enough"; refusing keeps the taxonomy honest.
    track('search_performed', {
      normalized_length: 5,
      result_count: 3,
      filter_count: 0,
      // @ts-expect-error deliberately violating the taxonomy
      query: 'آسمون شب',
    });

    expect(sent).toHaveLength(0);
  });

  it('never throws when the transport does', () => {
    setAnalyticsSink({
      track() {
        throw new Error('transport down');
      },
    });

    expect(() =>
      track('block_completed', { seed_id: 'seed-1', block_type: 'richText', ordinal: 1 })
    ).not.toThrow();
  });

  it('keeps context readable for error reports', () => {
    setAnalyticsContext({ seed_id: 'seed-1' });
    expect(getAnalyticsContext()).toMatchObject({ seed_id: 'seed-1' });
  });
});
