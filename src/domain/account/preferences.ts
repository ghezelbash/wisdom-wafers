import type { GuestSession } from '@/context/SessionContext';
import type { AccountPreferences } from '@/domain/account/sync';

/**
 * The guest session, as the account stores it.
 *
 * Only the fields a reader actually chose. `onboarded`, `notificationsAsked`
 * and `accountOfferSeen` are facts about *this device* — whether the ask has
 * been made here — and syncing them would suppress a prompt on a phone that
 * has never shown it.
 */
export function preferencesFromSession(
  session: GuestSession,
  locale: 'fa-IR' | 'en',
  timezone: string,
  at = new Date().toISOString()
): AccountPreferences {
  return {
    locale,
    timezone,
    interests: session.interests.slice(0, 20),
    notificationPreferences: {
      pace: session.pace,
      timeOfDay: session.timeOfDay,
      reminderTime: session.reminderTime,
      enabled: session.notificationsEnabled,
    },
    updatedAt: at,
  };
}

/** What the account knows, applied back onto the device's session. */
export function sessionFromPreferences(
  preferences: AccountPreferences,
  current: GuestSession
): Partial<GuestSession> {
  return {
    interests: preferences.interests,
    pace: preferences.notificationPreferences.pace as GuestSession['pace'],
    timeOfDay: preferences.notificationPreferences.timeOfDay as GuestSession['timeOfDay'],
    reminderTime: preferences.notificationPreferences.reminderTime,
    // Never turned *on* remotely: notifications need an OS permission this
    // device may not have, and a switch that says "on" without one is a lie.
    notificationsEnabled: current.notificationsEnabled && preferences.notificationPreferences.enabled,
  };
}

/** Whether two preference sets differ in anything worth a network call. */
export function preferencesChanged(a: AccountPreferences, b: AccountPreferences): boolean {
  const strip = ({ updatedAt: _ignored, ...rest }: AccountPreferences) => JSON.stringify(rest);
  return strip(a) !== strip(b);
}
