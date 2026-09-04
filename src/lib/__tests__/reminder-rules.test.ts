import {
  adjustForQuietHours,
  DEFAULT_QUIET_HOURS,
  HABIT_CAP_HOURS,
  isQuiet,
  mayNotify,
  parseTime,
} from '@/platform/reminder-rules';
import { routeFromNotificationData } from '@/platform/notifications';

describe('quiet hours', () => {
  it('covers a window that wraps past midnight', () => {
    // 23:00–08:00 is the default: late enough not to interrupt an evening,
    // early enough not to wake anyone.
    expect(isQuiet(23)).toBe(true);
    expect(isQuiet(3)).toBe(true);
    expect(isQuiet(7)).toBe(true);
    expect(isQuiet(8)).toBe(false);
    expect(isQuiet(21)).toBe(false);
  });

  it('handles a window inside one day', () => {
    const quiet = { startHour: 13, endHour: 15 };
    expect(isQuiet(14, quiet)).toBe(true);
    expect(isQuiet(15, quiet)).toBe(false);
    expect(isQuiet(1, quiet)).toBe(false);
  });

  it('treats an empty window as no quiet hours', () => {
    expect(isQuiet(3, { startHour: 8, endHour: 8 })).toBe(false);
  });
});

describe('adjusting a chosen time', () => {
  it('leaves a time outside quiet hours alone', () => {
    expect(adjustForQuietHours({ hour: 21, minute: 0 })).toEqual({ hour: 21, minute: 0 });
  });

  // The reader asked to be reminded; honour the intent rather than dropping it.
  it('moves a quiet-hours time to when they end', () => {
    expect(adjustForQuietHours({ hour: 2, minute: 30 })).toEqual({
      hour: DEFAULT_QUIET_HOURS.endHour,
      minute: 0,
    });
  });
});

describe('parsing a reminder time', () => {
  it('accepts a 24-hour time', () => {
    expect(parseTime('21:00')).toEqual({ hour: 21, minute: 0 });
    expect(parseTime('8:05')).toEqual({ hour: 8, minute: 5 });
  });

  it('rejects anything that is not one', () => {
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('21:60')).toBeNull();
    expect(parseTime('evening')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('the frequency cap', () => {
  const now = new Date('2026-09-03T21:00:00.000Z');

  it('allows the first notification', () => {
    expect(mayNotify(null, now)).toBe(true);
  });

  it('holds a second one back inside the same day', () => {
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    expect(mayNotify(sixHoursAgo, now)).toBe(false);
  });

  it('allows one again after the cap', () => {
    const past = new Date(now.getTime() - HABIT_CAP_HOURS * 60 * 60 * 1000).toISOString();
    expect(mayNotify(past, now)).toBe(true);
  });
});

describe('deep links', () => {
  it('takes a route a notification names', () => {
    expect(routeFromNotificationData({ route: '/seed/seed-sky-darkness' })).toBe(
      '/seed/seed-sky-darkness'
    );
    expect(routeFromNotificationData({ route: '/review' })).toBe('/review');
  });

  it('ignores anything that is not an in-app route', () => {
    expect(routeFromNotificationData({ route: 'https://example.com' })).toBeNull();
    expect(routeFromNotificationData({ route: 42 })).toBeNull();
    expect(routeFromNotificationData(undefined)).toBeNull();
  });
});
