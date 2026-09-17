// The reminder clock parser, split out of reminders.ts so it runs under
// `node --experimental-strip-types` — reminders.ts pulls in react-native and
// expo-notifications, which a check script cannot load. Same split as
// tuner-math.ts vs tuner-input.ts: the maths stays testable without a device.

/** "7:00 PM", "17:45", "5:45pm", "8 am" → { hour, minute }; null when it isn't a time. */
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

/** Canonical display label matching the presets: "5:45 PM". */
export const reminderLabel = ({ hour, minute }: { hour: number; minute: number }) =>
  `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
