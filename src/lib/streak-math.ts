// Pure streak math, node-runnable (see scripts/check-streak.ts).

export type StreakMode = 'off' | 'strict' | 'relaxed';

// relaxed forgives one missed day per gap; strict forgives none
export const graceFor = (mode: StreakMode) => (mode === 'relaxed' ? 1 : 0);

export const dateKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' });

// Streak derived from history so backdated logs count too. A practiced break
// day extends it; an unpracticed break day is skipped; a 0-minute today
// doesn't break it (the day isn't over yet). graceDays missed days per gap
// are forgiven (they don't count toward the streak).
export function computeStreak(
  minutesByDate: Record<string, number>,
  breakDays: string[],
  graceDays = 0,
  today: Date = new Date(),
): number {
  let streak = 0;
  let grace = graceDays;
  const d = new Date(today);
  if (!((minutesByDate[dateKey(d)] ?? 0) > 0)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    if ((minutesByDate[dateKey(d)] ?? 0) > 0) {
      streak++;
      grace = graceDays;
    } else if (breakDays.includes(dayName(d))) {
      // skipped, doesn't consume grace
    } else if (grace > 0) {
      grace--;
    } else {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
