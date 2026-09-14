import { Platform } from 'react-native';

import { tr } from './i18n';

// ponytail: expo-notifications throws on load in Expo Go Android (SDK 53+ removed
// push there) — require in try/catch so Expo Go doesn't crash; reminders no-op there.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  // show reminders even while the app is foregrounded
  if (Platform.OS !== 'web')
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
} catch {
  Notifications = null;
}

// "7:00 PM", "17:45", "5:45pm", "8 am" → { hour, minute }; null when it isn't a time
export const parseReminderTime = (label: string): { hour: number; minute: number } | null => {
  const m = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const ap = m[3]?.toUpperCase();
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ap === 'PM' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

// canonical display label matching the presets: "5:45 PM"
export const reminderLabel = ({ hour, minute }: { hour: number; minute: number }) =>
  `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;

// Re-syncs the daily reminder to match the setting. Runs on every app start and
// on every change, so a permission granted later in system settings self-heals.
// Returns false when permission is denied (caller may toast).
// Bundled by the expo-notifications config plugin (see app.json) — referenced
// by base filename, which is all the plugin exposes. `undefined` falls back to
// the system sound when the user has turned the app's cues off.
const PING = 'cue_reminder.wav';

export async function syncReminder(reminder: string, sounds = true): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return true; // ponytail: no web notifications — mobile-first app; null in Expo Go Android
  await Notifications.cancelAllScheduledNotificationsAsync();
  const time = parseReminderTime(reminder);
  if (reminder === 'Off' || !time) return true;
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('reminders', {
      name: tr('reminders.channelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: sounds ? PING : 'default',
    });
  await Notifications.scheduleNotificationAsync({
    content: { title: tr('reminders.notifTitle'), body: tr('reminders.notifBody'), sound: sounds ? PING : 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
  return true;
}

/**
 * One-off notification when a practice break ends (#59), for when the app is
 * backgrounded during the break. Returns the id to cancel with, or null.
 */
export async function scheduleBreakEnd(sec: number): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications || sec <= 0) return null;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('breaks', { name: tr('practice.breakChannel'), importance: Notifications.AndroidImportance.DEFAULT });
    return await Notifications.scheduleNotificationAsync({
      content: { title: tr('practice.breakOverTitle'), body: tr('practice.breakOverBody') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: sec, channelId: Platform.OS === 'android' ? 'breaks' : undefined },
    });
  } catch {
    return null;
  }
}

export function cancelBreakEnd(id: string | null) {
  if (id && Notifications) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// false only when the OS has actually blocked us — unknown/unsupported reads as allowed
export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return true;
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  return granted || canAskAgain;
}
