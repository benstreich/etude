import { Platform } from 'react-native';

import { tr } from './i18n';
import { parseReminderTime, reminderFireDates } from './reminder-time';
import { dateKey } from './streak-math';

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

// parseReminderTime/reminderLabel live in their own react-native-free file so
// scripts/check-reminders.ts can import them; re-exported here for callers.
export { parseReminderTime, reminderDisplay, reminderLabel } from './reminder-time';

// Re-syncs the daily reminder to match the setting. Runs on every app start and
// on every change, so a permission granted later in system settings self-heals.
// Returns false when permission is denied (caller may toast).
// Bundled by the expo-notifications config plugin (see app.json) — referenced
// by base filename, which is all the plugin exposes. `undefined` falls back to
// the system sound when the user has turned the app's cues off.
const PING = 'cue_reminder.wav';
const REMINDER_ID = 'daily-reminder';

type SyncOptions = {
  /**
   * Ask the OS for permission if it hasn't been granted. Only a change the user
   * just made may prompt — the launch resync used to, and on Android 13+ one
   * "Don't allow" then brought the system sheet back on every cold start.
   */
  prompt?: boolean;
  /**
   * Today already has practice logged: the reminder promises to stay quiet on
   * such days. A repeating daily trigger cannot skip one, so the reminder is
   * armed as one-offs from tomorrow instead and re-armed on every sync (launch,
   * foreground, midnight, each log) — the daily trigger returns once a day has
   * no practice yet.
   */
  practisedToday?: boolean;
};

export async function syncReminder(reminder: string, sounds = true, { prompt = false, practisedToday = false }: SyncOptions = {}): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return true; // ponytail: no web notifications — mobile-first app; null in Expo Go Android
  // cancel only the daily reminder — a pending break-over notification (a
  // time-interval trigger) must survive. Cancelling every non-interval request
  // also clears reminders scheduled before they had a fixed identifier.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((r) => (r.trigger as { type?: string } | null)?.type !== 'timeInterval')
      .map((r) => Notifications!.cancelScheduledNotificationAsync(r.identifier))
  );
  const time = parseReminderTime(reminder);
  if (reminder === 'Off' || !time) return true;
  const have = await Notifications.getPermissionsAsync();
  const granted = have.granted || (prompt && have.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return false;
  // Android fixes a channel's sound once it exists, so each sound gets its own
  // channel; the unused one and the legacy 'reminders' channel are removed
  const channelId = sounds ? 'reminders-cue' : 'reminders-default';
  if (Platform.OS === 'android') {
    await Promise.all(
      ['reminders', sounds ? 'reminders-default' : 'reminders-cue'].map((id) => Notifications!.deleteNotificationChannelAsync(id))
    );
    await Notifications.setNotificationChannelAsync(channelId, {
      name: tr('reminders.channelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: sounds ? PING : 'default',
    });
  }
  const content = { title: tr('reminders.notifTitle'), body: tr('reminders.notifBody'), sound: sounds ? PING : 'default' };
  const channel = Platform.OS === 'android' ? channelId : undefined;
  if (!practisedToday) {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute, channelId: channel },
    });
    return true;
  }
  for (const date of reminderFireDates(new Date(), time))
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_ID}-${dateKey(date)}`,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: channel },
    });
  return true;
}

/**
 * Opens Practice when the reminder is tapped — from the background and from a
 * cold start alike. The launch response is cleared once handled; it otherwise
 * stays the "last response" and would re-open Practice on every later start.
 */
export function onReminderOpened(open: () => void): () => void {
  if (Platform.OS === 'web' || !Notifications) return () => {};
  const N = Notifications;
  const isReminder = (r: import('expo-notifications').NotificationResponse | null) => !!r && r.notification.request.identifier.startsWith(REMINDER_ID);
  N.getLastNotificationResponseAsync()
    .then((r) => {
      if (!isReminder(r)) return;
      N.clearLastNotificationResponseAsync().catch(() => {});
      open();
    })
    .catch(() => {});
  const sub = N.addNotificationResponseReceivedListener((r) => {
    if (isReminder(r)) open();
  });
  return () => sub.remove();
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

/** Ask for notification permission if the OS still lets us; resolves to whether we have it. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return false;
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (granted || !canAskAgain) return granted;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

// false only when the OS has actually blocked us — unknown/unsupported reads as allowed
export async function notificationsAllowed(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return true;
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  return granted || canAskAgain;
}
