import { Platform } from 'react-native';

import { track } from './analytics';
import { isEnabled } from './config';
import { adjustForQuietHours, parseTime, type QuietHours } from './reminder-rules';

export { routeFromNotificationData, isAllowedRoute } from './deep-links';

/**
 * Local reminders.
 *
 * Permission is requested only after the first completed seed, and only from
 * the screen that explains the frequency cap first — never on launch. Nothing
 * here schedules a remote message; FCM arrives with the native migration.
 *
 * The module is a no-op on web, where scheduling is not available: the app
 * still records the preference so the setting is honest about what it does.
 */

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const REMINDER_IDENTIFIER = 'dananeh.daily-reminder';

/**
 * The Android channel.
 *
 * From Android 8 a notification with no channel is dropped, and from Android 13
 * the channel is what the reader sees in system settings — so its name has to
 * say what it is in their language, not "Default". One channel, because there
 * is one kind of notification and the cap is one a day.
 */
export const REMINDER_CHANNEL = 'daily-reminder';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

async function api() {
  if (!supported) return null;
  return import('expo-notifications');
}

let channelReady: Promise<void> | null = null;

/**
 * Creates the channel, once.
 *
 * Called before scheduling and before asking for permission, because on
 * Android 13+ the permission sheet is about the app while the channel is what
 * the reader can later turn off on its own — and a channel that appears after
 * the ask is one they never chose.
 */
export async function ensureNotificationChannel(copy?: {
  name: string;
  description: string;
}): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (channelReady) return channelReady;

  channelReady = (async () => {
    const notifications = await api();
    if (!notifications) return;

    await notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: copy?.name ?? 'یادآوری روزانه',
      description: copy?.description ?? 'یک یادآوری در روز، در ساعتی که خودت انتخاب کرده‌ای.',
      importance: notifications.AndroidImportance.DEFAULT,
      // A habit reminder is not an alarm: no heads-up, no sound override.
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 200],
      lightColor: '#2F6D4B',
    });
  })();

  return channelReady;
}

export async function getPermissionState(): Promise<PermissionState> {
  const notifications = await api();
  if (!notifications) return 'unsupported';

  const { status } = await notifications.getPermissionsAsync();
  return status as PermissionState;
}

export async function requestPermission(): Promise<PermissionState> {
  const notifications = await api();
  if (!notifications) return 'unsupported';

  // The channel first: on Android 13+ the reader can turn this category off on
  // its own afterwards, and a channel that appears later is one they never saw.
  await ensureNotificationChannel();

  const { status } = await notifications.requestPermissionsAsync();

  // Recorded here rather than at the call site: this is the only place the ask
  // happens, so the funnel cannot go missing when a second screen learns to ask.
  track('notification_permission', { state: status });
  return status as PermissionState;
}

/**
 * Schedules the one daily reminder, replacing any previous one.
 *
 * Replacing rather than adding is what enforces the cap: there is never more
 * than one habit notification on the schedule.
 */
export async function scheduleDailyReminder(
  time: string,
  copy: { title: string; body: string },
  quiet?: QuietHours
): Promise<{ scheduled: boolean; at?: { hour: number; minute: number } }> {
  // Switched off remotely: nothing is scheduled, and anything already on the
  // schedule is taken off. A kill switch that only stops *new* reminders would
  // leave every existing reader still being pinged.
  if (!isEnabled('remindersEnabled')) {
    await cancelDailyReminder();
    return { scheduled: false };
  }

  const notifications = await api();
  if (!notifications) return { scheduled: false };

  const parsed = parseTime(time);
  if (!parsed) return { scheduled: false };

  const at = adjustForQuietHours(parsed, quiet);

  // Without a channel, Android 8+ drops the notification outright.
  await ensureNotificationChannel();

  await cancelDailyReminder();
  await notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: copy.title,
      body: copy.body,
      // Deep link target: the reminder opens today's seed, not a generic home.
      // Validated against the route allow-list on the way back in.
      data: { route: '/' },
    },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DAILY,
      hour: at.hour,
      minute: at.minute,
      channelId: REMINDER_CHANNEL,
    },
  });

  return { scheduled: true, at };
}

export async function cancelDailyReminder(): Promise<void> {
  const notifications = await api();
  if (!notifications) return;

  try {
    await notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  } catch {
    // Nothing scheduled is the expected case on a first run.
  }
}


