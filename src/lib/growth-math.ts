// Pure logic for the growth features (#17): session-review achievements,
// tempo-ladder deltas, recap-card stats. Node-runnable (see scripts/check-growth.ts).

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { computeBestStreak, dateKey } from './streak-math.ts';

export type Achievement = { kind: 'streak' | 'milestone'; label: string };

const shiftKey = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
};

// last-7-days total ending at `end`
const weekTotal = (minutesByDate: Record<string, number>, end: string) => {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += minutesByDate[shiftKey(end, -i)] ?? 0;
  return sum;
};

/** Chips for the session-review screen, priority-ordered, max 2. */
export function achievements(opts: {
  streak: number;
  sessionCount: number;
  minutesByDate: Record<string, number>;
  dailyGoal: number;
  today: string;
}): Achievement[] {
  const { streak, sessionCount, minutesByDate, dailyGoal, today } = opts;
  const out: Achievement[] = [];
  if (streak >= 2) out.push({ kind: 'streak', label: `${streak}-day streak` });
  if (sessionCount === 1) out.push({ kind: 'milestone', label: 'First session' });
  else {
    // best week: this rolling 7-day window beats every earlier one that had data
    const thisWeek = weekTotal(minutesByDate, today);
    if (thisWeek > 0) {
      let best = true;
      for (const key of Object.keys(minutesByDate)) {
        if (key >= today || !(minutesByDate[key] > 0)) continue;
        // windows ending on each practiced day cover all maxima
        if (key < shiftKey(today, -6) && weekTotal(minutesByDate, key) >= thisWeek) {
          best = false;
          break;
        }
      }
      // only a brag once there is history to beat
      const hasHistory = Object.keys(minutesByDate).some((k) => k < shiftKey(today, -6) && minutesByDate[k] > 0);
      if (best && hasHistory) out.push({ kind: 'milestone', label: 'Best week yet' });
    }
    if (dailyGoal > 0) {
      let all = true;
      for (let i = 0; i < 7; i++) if ((minutesByDate[shiftKey(today, -i)] ?? 0) < dailyGoal) all = false;
      if (all) out.push({ kind: 'milestone', label: 'Goal hit 7 days straight' });
    }
  }
  return out.slice(0, 2);
}

export type TempoEntry = { date: string; bpm: number };

/** BPM gained this calendar month: last entry vs. the baseline before the month
 * (or the month's first entry when the log starts this month). 0 when flat,
 * negative when it dropped, 0 when the month has no entries. Log is sorted ascending. */
export function tempoDelta(log: TempoEntry[], todayKey: string): number {
  const monthStart = todayKey.slice(0, 7) + '-01';
  const inMonth = log.filter((e) => e.date >= monthStart && e.date <= todayKey);
  if (inMonth.length === 0) return 0;
  const before = log.filter((e) => e.date < monthStart);
  const base = before.length ? before[before.length - 1].bpm : inMonth[0].bpm;
  return inMonth[inMonth.length - 1].bpm - base;
}

export type RecapStats = {
  totalMin: number;
  daysPracticed: number;
  longestStreak: number;
  topPiece: string | null;
  monthlyMinutes: number[]; // 12 entries, Jan..Dec of `year`
};

/** Stats for a recap card. Pass `month` (0-based) for a monthly card, omit for year-so-far. */
export function recapStats(opts: {
  sessions: { title: string; min: number; date: string }[];
  minutesByDate: Record<string, number>;
  breakDays: string[];
  year: number;
  month?: number;
}): RecapStats {
  const { sessions, minutesByDate, breakDays, year, month } = opts;
  const prefix = month === undefined ? `${year}-` : `${year}-${String(month + 1).padStart(2, '0')}-`;
  const inPeriod: Record<string, number> = {};
  let totalMin = 0;
  let daysPracticed = 0;
  const monthlyMinutes = Array(12).fill(0) as number[];
  for (const [key, min] of Object.entries(minutesByDate)) {
    if (!key.startsWith(prefix) || !(min > 0)) continue;
    inPeriod[key] = min;
    totalMin += min;
    daysPracticed++;
    if (key.startsWith(`${year}-`)) monthlyMinutes[Number(key.slice(5, 7)) - 1] += min;
  }
  const byPiece: Record<string, number> = {};
  for (const s of sessions) if (s.date.startsWith(prefix)) byPiece[s.title] = (byPiece[s.title] ?? 0) + s.min;
  const top = Object.entries(byPiece).sort((a, b) => b[1] - a[1])[0];
  return {
    totalMin,
    daysPracticed,
    longestStreak: computeBestStreak(inPeriod, breakDays),
    topPiece: top ? top[0] : null,
    monthlyMinutes,
  };
}
