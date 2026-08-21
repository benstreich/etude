import { Platform } from 'react-native';

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

// "7:00 PM" → 19; the picker only offers PM times but parse honestly anyway
const toHour = (label: string) => {
  const [h, rest] = label.split(':');
  return (Number(h) % 12) + (rest.includes('PM') ? 12 : 0);
};

// Re-syncs the daily reminder to match the setting. Runs on every app start and
// on every change, so a permission granted later in system settings self-heals.
// Returns false when permission is denied (caller may toast).
export async function syncReminder(reminder: string): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return true; // ponytail: no web notifications — mobile-first app; null in Expo Go Android
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (reminder === 'Off') return true;
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Practice reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Time to practice 🎵', body: 'A few minutes today keeps the streak alive.' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: toHour(reminder),
      minute: 0,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
  return true;
}
