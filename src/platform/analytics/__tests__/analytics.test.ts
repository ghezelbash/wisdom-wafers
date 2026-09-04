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

/**
 * The shapes a leak actually arrives in.
 *
 * The guard walks the parameters a call site passes, and the failure that
 * matters is not the obvious `{ email: '…' }` — it is a reflection nested one
 * level down inside an object that looked structural, or an array of answers
 * whose element type nobody checked.
 */
describe('the PII guard, on the shapes a leak arrives in', () => {
  const persianProse =
    'من امروز درباره‌ی این موضوع فکر کردم و به این نتیجه رسیدم که باید بیشتر بخوانم';

  it('refuses a nested object outright rather than looking inside it', () => {
    // Refused as a type, not inspected: an allow-list that recursed would have
    // to decide what a *safe* nested shape is, and there is no such shape here.
    const issues = validateParams({
      seed_id: 'seed-anchoring',
      answer: { reflection: persianProse },
    });

    expect(issues).toEqual([{ key: 'answer', reason: 'unsupported-type' }]);
  });

  it('refuses an array, however innocent its elements look', () => {
    expect(validateParams({ ranks: [1, 2, 3] })).toEqual([
      { key: 'ranks', reason: 'unsupported-type' },
    ]);
    expect(validateParams({ choices: ['a', 'b'] })).toEqual([
      { key: 'choices', reason: 'unsupported-type' },
    ]);
  });

  it('refuses a suspicious key whatever the value is', () => {
    for (const key of [
      'email',
      'user_name',
      'search_query',
      'answer_text',
      'reflection',
      'seed_title',
      'id_token',
      'phone_number',
      'home_address',
    ]) {
      expect(validateParams({ [key]: 1 })).toEqual([{ key, reason: 'forbidden-key' }]);
    }
  });

  it('refuses Persian prose under a name that gives nothing away', () => {
    // The value is what condemns it: four words of running text under `note`.
    expect(validateParams({ note: persianProse })).toEqual([
      { key: 'note', reason: 'looks-personal' },
    ]);
  });

  it('still allows the Persian strings that are categories, not content', () => {
    // ZWNJ and all: a topic label is content the app authored, not the reader's.
    expect(validateParams({ topic: 'روان‌شناسی', family: 'علوم' })).toEqual([]);
  });

  it('refuses a long Persian identifier before it can become a payload', () => {
    expect(validateParams({ label: 'ن'.repeat(65) })).toEqual([
      { key: 'label', reason: 'looks-personal' },
    ]);
  });

  it('names every offending key, not just the first', () => {
    const issues = validateParams({
      seed_id: 'seed-anchoring',
      email: 'x',
      note: persianProse,
      payload: {},
    });

    expect(issues.map((issue) => issue.key).sort()).toEqual(['email', 'note', 'payload']);
  });
});
