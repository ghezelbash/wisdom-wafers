/**
 * When a reminder may fire, expressed without any platform API so it can be
 * reasoned about and tested on its own.
 *
 * Two promises the app makes to the reader: at most one habit reminder a day,
 * and never inside quiet hours. Both are enforced here rather than trusted to
 * whoever schedules.
 */

export interface QuietHours {
  /** 24h, inclusive start, exclusive end; may wrap past midnight. */
  startHour: number;
  endHour: number;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 23, endHour: 8 };

/** At most one habit notification in 24 hours, transactional messages aside. */
export const HABIT_CAP_HOURS = 24;

export function isQuiet(hour: number, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  if (quiet.startHour === quiet.endHour) return false;
  return quiet.startHour < quiet.endHour
    ? hour >= quiet.startHour && hour < quiet.endHour
    : hour >= quiet.startHour || hour < quiet.endHour;
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

/**
 * Moves a requested time out of quiet hours to the moment they end.
 *
 * The reader picked a time; the app honours the intent rather than silently
 * dropping the reminder.
 */
export function adjustForQuietHours(
  time: { hour: number; minute: number },
  quiet: QuietHours = DEFAULT_QUIET_HOURS
): { hour: number; minute: number } {
  return isQuiet(time.hour, quiet) ? { hour: quiet.endHour, minute: 0 } : time;
}

/** Whether another habit notification is allowed yet. */
export function mayNotify(lastSentAt: string | null, now: Date): boolean {
  if (!lastSentAt) return true;
  const elapsed = now.getTime() - new Date(lastSentAt).getTime();
  return elapsed >= HABIT_CAP_HOURS * 60 * 60 * 1000;
}
