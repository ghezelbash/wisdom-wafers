import type { SeedProgress } from '@/lib/progress-store';
import {
  dueItems,
  FIRST_REVIEW_DAYS,
  GRACE_DAYS,
  growthCount,
  INTERVAL_DAYS,
  nextReviewFor,
  upcomingItems,
  weeklyGrowth,
} from '@/lib/schedule';

const DAY = 24 * 60 * 60 * 1000;
const at = (from: Date, days: number) => new Date(from.getTime() + days * DAY).toISOString();

function progress(overrides: Partial<SeedProgress> = {}): SeedProgress {
  return {
    seedId: 'seed-1',
    revision: 1,
    blockIndex: 0,
    answers: {},
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('intervals', () => {
  it('states the intervals the review screen promises', () => {
    expect(INTERVAL_DAYS).toEqual({ easy: 14, good: 7, hard: 3, again: 1 });
  });

  it('asks the first time on day three, which is what the summary block says', () => {
    expect(FIRST_REVIEW_DAYS).toBe(3);
  });
});

describe('nextReviewFor', () => {
  const now = new Date('2026-09-03T10:00:00.000Z');

  it('is undefined until a seed is finished', () => {
    expect(nextReviewFor(progress())).toBeUndefined();
    expect(nextReviewFor(progress({ blockIndex: 5 }))).toBeUndefined();
  });

  it('schedules three days out from a completion', () => {
    const due = nextReviewFor(progress({ completedAt: now.toISOString() }));
    expect(due).toBe(at(now, 3));
  });

  it('uses the last review pass and its interval once one exists', () => {
    const due = nextReviewFor(
      progress({
        completedAt: at(now, -20),
        reviewedAt: now.toISOString(),
        reviewInterval: INTERVAL_DAYS.easy,
      })
    );
    expect(due).toBe(at(now, 14));
  });
});

describe('the due queue', () => {
  const now = new Date('2026-09-03T10:00:00.000Z');
  const all = [
    progress({ seedId: 'overdue', completedAt: at(now, -10) }),
    progress({ seedId: 'due-today', completedAt: at(now, -3) }),
    progress({ seedId: 'not-yet', completedAt: at(now, -1) }),
    progress({ seedId: 'unfinished', blockIndex: 2 }),
  ];

  it('returns only what is actually due, oldest first', () => {
    expect(dueItems(all, now).map((item) => item.seedId)).toEqual(['overdue', 'due-today']);
  });

  it('keeps everything else as upcoming, soonest first', () => {
    expect(upcomingItems(all, now).map((item) => item.seedId)).toEqual(['not-yet']);
  });

  it('never surfaces an unfinished seed for review', () => {
    const ids = [...dueItems(all, now), ...upcomingItems(all, now)].map((item) => item.seedId);
    expect(ids).not.toContain('unfinished');
  });
});

describe('weekly growth', () => {
  const now = new Date('2026-09-03T21:00:00.000Z');

  it('marks today in the last slot and six days ago in the first', () => {
    const days = weeklyGrowth(
      [
        progress({ seedId: 'a', completedAt: now.toISOString() }),
        progress({ seedId: 'b', completedAt: at(now, -6) }),
      ],
      now
    );
    expect(days[6]).toBe(true);
    expect(days[0]).toBe(true);
    expect(growthCount(days)).toBe(2);
  });

  it('ignores anything older than the week', () => {
    const days = weeklyGrowth([progress({ completedAt: at(now, -7) })], now);
    expect(growthCount(days)).toBe(0);
  });

  it('counts two completions on one day once', () => {
    const days = weeklyGrowth(
      [
        progress({ seedId: 'a', completedAt: now.toISOString() }),
        progress({ seedId: 'b', completedAt: at(now, -0.2) }),
      ],
      now
    );
    expect(growthCount(days)).toBe(1);
  });

  it('crosses a month boundary without losing a day', () => {
    const firstOfMonth = new Date('2026-09-01T12:00:00.000Z');
    const days = weeklyGrowth(
      [progress({ completedAt: at(firstOfMonth, -2) })], // 30 August
      firstOfMonth
    );
    expect(growthCount(days)).toBe(1);
    expect(days[4]).toBe(true);
  });

  it('gives the week one grace day, so a gap does not break it', () => {
    expect(GRACE_DAYS).toBe(1);
    const days = weeklyGrowth(
      [
        progress({ seedId: 'a', completedAt: now.toISOString() }),
        progress({ seedId: 'b', completedAt: at(now, -2) }),
      ],
      now
    );
    // The missed day between them is simply not filled; nothing resets.
    expect(days).toEqual([false, false, false, false, true, false, true]);
  });
});
