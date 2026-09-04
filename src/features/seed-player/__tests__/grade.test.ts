import { grade, scramble, toAnswer } from '@/features/seed-player/grade';
import type { SeedBlock } from '@/models/seed';

const multipleChoice = {
  id: 'mc',
  type: 'multipleChoice',
  question: 'کدام؟',
  explanation: 'چون…',
  options: [
    { id: 'o1', text: 'اول', isCorrect: false },
    { id: 'o2', text: 'دوم', isCorrect: true },
  ],
} as SeedBlock;

const multiSelect = {
  id: 'ms',
  type: 'multiSelect',
  question: 'کدام‌ها؟',
  explanation: 'چون…',
  options: [
    { id: 'o1', text: 'یک', isCorrect: true },
    { id: 'o2', text: 'دو', isCorrect: true },
    { id: 'o3', text: 'سه', isCorrect: false },
    { id: 'o4', text: 'چهار', isCorrect: false },
  ],
} as SeedBlock;

const trueFalse = {
  id: 'tf',
  type: 'trueFalse',
  statement: 'درست است.',
  answer: true,
  explanation: 'چون…',
} as SeedBlock;

const ordering = {
  id: 'ord',
  type: 'ordering',
  prompt: 'بچین',
  items: [
    { id: 'i1', text: 'یک' },
    { id: 'i2', text: 'دو' },
    { id: 'i3', text: 'سه' },
  ],
} as SeedBlock;

const matchPairs = {
  id: 'mp',
  type: 'matchPairs',
  prompt: 'وصل کن',
  pairs: [
    { id: 'p1', concept: 'الف', description: 'توضیح الف' },
    { id: 'p2', concept: 'ب', description: 'توضیح ب' },
  ],
} as SeedBlock;

describe('multipleChoice', () => {
  it('is right only for the correct option', () => {
    expect(grade(multipleChoice, { selected: ['o2'] })).toEqual({ correct: true, partial: false });
    expect(grade(multipleChoice, { selected: ['o1'] })).toEqual({ correct: false, partial: false });
  });

  it('is never partial — one answer is right or it is not', () => {
    expect(grade(multipleChoice, { selected: [] }).partial).toBe(false);
  });
});

describe('multiSelect', () => {
  it('is right only when every correct option is picked and no wrong one is', () => {
    expect(grade(multiSelect, { selected: ['o1', 'o2'] })).toMatchObject({
      correct: true,
      partial: false,
      hits: 2,
      expected: 2,
    });
  });

  // Partial credit is its own state, not a rounded-down failure.
  it('is partial when one of two is found', () => {
    expect(grade(multiSelect, { selected: ['o1'] })).toMatchObject({
      correct: false,
      partial: true,
      hits: 1,
      expected: 2,
    });
  });

  it('is partial when a right answer comes with a wrong one', () => {
    expect(grade(multiSelect, { selected: ['o1', 'o3'] })).toMatchObject({
      correct: false,
      partial: true,
      hits: 1,
    });
  });

  it('is plain wrong when nothing correct was picked', () => {
    expect(grade(multiSelect, { selected: ['o3', 'o4'] })).toMatchObject({
      correct: false,
      partial: false,
      hits: 0,
    });
  });
});

describe('trueFalse', () => {
  it('compares against the stated answer', () => {
    expect(grade(trueFalse, { bool: true }).correct).toBe(true);
    expect(grade(trueFalse, { bool: false }).correct).toBe(false);
    expect(grade(trueFalse, {}).correct).toBe(false);
  });
});

describe('ordering', () => {
  it('is right only for the exact stored order', () => {
    expect(grade(ordering, { order: ['i1', 'i2', 'i3'] }).correct).toBe(true);
    expect(grade(ordering, { order: ['i2', 'i1', 'i3'] }).correct).toBe(false);
  });

  it('counts how many landed in the right place', () => {
    expect(grade(ordering, { order: ['i1', 'i3', 'i2'] })).toMatchObject({
      correct: false,
      partial: true,
      hits: 1,
      expected: 3,
    });
  });

  it('is not correct when the answer is incomplete', () => {
    expect(grade(ordering, { order: ['i1', 'i2'] }).correct).toBe(false);
  });
});

describe('matchPairs', () => {
  it('needs every concept matched to its own description', () => {
    expect(
      grade(matchPairs, { pairs: { p1: 'توضیح الف', p2: 'توضیح ب' } }).correct
    ).toBe(true);
  });

  it('is partial with one pair right', () => {
    expect(grade(matchPairs, { pairs: { p1: 'توضیح الف', p2: 'توضیح الف' } })).toMatchObject({
      correct: false,
      partial: true,
      hits: 1,
      expected: 2,
    });
  });
});

describe('toAnswer', () => {
  it('records the attempt alongside the verdict', () => {
    const result = grade(multiSelect, { selected: ['o1'] });
    const answer = toAnswer('ms', { selected: ['o1'] }, result, 2);
    expect(answer).toMatchObject({
      blockId: 'ms',
      correct: false,
      partial: true,
      attempts: 2,
      selected: ['o1'],
    });
  });
});

describe('scramble', () => {
  it('is deterministic for the same seed', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const once = scramble(items, 'block-1', (item) => item.id);
    const twice = scramble(items, 'block-1', (item) => item.id);
    expect(once).toEqual(twice);
  });

  it('keeps every item', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const shuffled = scramble(items, 'block-2', (item) => item.id);
    expect(shuffled.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    scramble(items, 'block-3', (item) => item.id);
    expect(items.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
