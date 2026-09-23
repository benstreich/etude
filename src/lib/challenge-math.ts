// The monthly challenge (#105): one quiet, private challenge per calendar month,
// derived from the user's own history — "practise on 18 days", "beat last
// month's minutes". Entirely derived state: same minutesByDate and settings,
// same challenge, so nothing is stored and a restore needs no thought. Pure and
// node-runnable — see scripts/check-challenge.ts.
//
// Never punitive by construction: a missed month simply lowers next month's bar,
// because every target is last month's result nudged up, not a fixed ladder.
import { periodMinutes, periodRange, practiceDays } from './goal-math.ts';

export type ChallengeKind = 'minutes' | 'days' | 'goalDays';

export type Challenge = {
  month: string; // 'YYYY-MM'
  kind: ChallengeKind;
  target: number; // minutes, days, or goal-met days
  done: number; // same unit, so far this month
  met: boolean;
  daysLeft: number; // calendar days remaining incl. today
};

export type ChallengeOpts = {
  todayKey: string; // 'YYYY-MM-DD'
  minutesByDate: Record<string, number>;
  dailyGoal: number;
  breakDays: string[]; // weekday names, as goal-math takes them
  weekStart: string;
};

/** No challenge until this many distinct practice days exist before the month. */
export const CHALLENGE_FLOOR_DAYS = 14;
/** The kinds rotate month by month, so a year sees each one four times. */
export const KINDS: ChallengeKind[] = ['days', 'minutes', 'goalDays'];
/** Day-count targets never ask for fewer than this, whatever last month was. */
export const DAYS_MIN = 4;
/** Minute targets never ask for less than this. */
export const MINUTES_MIN = 60;
/** Last month's minutes are nudged up by this much, then rounded up to ten. */
export const MINUTES_NUDGE = 1.1;
/** After a month with no practice, the minutes target restarts at this many daily goals. */
export const RESTART_GOALS = 12;

const pad = (n: number) => String(n).padStart(2, '0');
const dayNum = (key: string) => Math.round(new Date(key + 'T12:00:00').getTime() / 86_400_000);
const weekStartOf = (s: string): 'Monday' | 'Sunday' => (s === 'Sunday' ? 'Sunday' : 'Monday');

const daysWith = (mbd: Record<string, number>, from: string, to: string, atLeast: number) =>
  Object.keys(mbd).filter((k) => k >= from && k <= to && mbd[k] >= atLeast && mbd[k] > 0).length;

/** Which kind a month gets: deterministic from the month itself, `goalDays` falling back to `days` without a daily goal. */
export function challengeKind(monthKey: string, dailyGoal: number): ChallengeKind {
  const [y, m] = monthKey.split('-').map(Number);
  const kind = KINDS[(y * 12 + (m - 1)) % KINDS.length];
  return kind === 'goalDays' && dailyGoal <= 0 ? 'days' : kind;
}

export function monthlyChallenge(o: ChallengeOpts): Challenge | null {
  const mbd = o.minutesByDate;
  const { from, to } = periodRange('month', o.todayKey, weekStartOf(o.weekStart));
  // the data floor counts history strictly before this month: a first month is not judged against itself
  const history = Object.keys(mbd).filter((k) => mbd[k] > 0 && k < from).length;
  if (history < CHALLENGE_FLOOR_DAYS) return null;

  const month = from.slice(0, 7);
  const kind = challengeKind(month, o.dailyGoal);

  // last month, whole
  const [y, m] = from.split('-').map(Number);
  const lastKey = `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}-01`;
  const last = periodRange('month', lastKey, weekStartOf(o.weekStart));
  const lastDays = daysWith(mbd, last.from, last.to, 1);
  const lastMinutes = periodMinutes(mbd, last.from, last.to);
  const lastGoalDays = o.dailyGoal > 0 ? daysWith(mbd, last.from, last.to, o.dailyGoal) : 0;

  // this month can only ask for days that are not break days — capped first, floored second,
  // so a week of break days still leaves a target of DAYS_MIN rather than nothing
  const cap = practiceDays(from, to, o.breakDays);
  const clampDays = (n: number) => Math.max(DAYS_MIN, Math.min(n, cap));

  let target: number;
  if (kind === 'days') target = clampDays(lastDays + 1);
  else if (kind === 'goalDays') target = clampDays(lastGoalDays + 1);
  else target = Math.max(MINUTES_MIN, lastMinutes > 0 ? Math.ceil((lastMinutes * MINUTES_NUDGE) / 10) * 10 : o.dailyGoal * RESTART_GOALS);

  const upTo = o.todayKey < to ? o.todayKey : to;
  const done =
    kind === 'days' ? daysWith(mbd, from, upTo, 1) : kind === 'goalDays' ? daysWith(mbd, from, upTo, o.dailyGoal) : periodMinutes(mbd, from, upTo);

  return { month, kind, target, done, met: done >= target, daysLeft: Math.max(0, dayNum(to) - dayNum(o.todayKey) + 1) };
}

/** True when a session has just carried the month over its line: unmet before it, met after. */
export const challengeJustMet = (before: Challenge | null, after: Challenge | null): boolean => !!before && !before.met && !!after && after.met;
