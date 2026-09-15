// Week/month/year practice goals and piece deadlines (#56). Pure and
// node-runnable — see scripts/check-goal.ts.
//
// A period goal of 0 means "derive from the daily goal": daily × the practice
// days in the period (break days excluded). ponytail: one branch instead of a
// second "auto" flag, and the derived number stays right when the daily goal
// or the break days change.

export type GoalPeriod = 'week' | 'month' | 'year';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** First and last dateKey of the calendar period `todayKey` falls in. */
export function periodRange(period: GoalPeriod, todayKey: string, weekStart: 'Monday' | 'Sunday' = 'Monday') {
  const d = parse(todayKey);
  if (period === 'week') {
    const offset = (d.getDay() - (weekStart === 'Monday' ? 1 : 0) + 7) % 7;
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: key(from), to: key(to) };
  }
  if (period === 'month')
    return {
      from: key(new Date(d.getFullYear(), d.getMonth(), 1)),
      to: key(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

/** Minutes logged between two dateKeys, inclusive. */
export function periodMinutes(minutesByDate: Record<string, number>, from: string, to: string) {
  let total = 0;
  for (const [k, min] of Object.entries(minutesByDate)) if (k >= from && k <= to) total += min;
  return total;
}

/** Days in the range that aren't break days. */
export function practiceDays(from: string, to: string, breakDays: string[] = []) {
  let n = 0;
  for (const d = parse(from), end = parse(to); d <= end; d.setDate(d.getDate() + 1))
    if (!breakDays.includes(DOW[d.getDay()])) n++;
  return n;
}

export type GoalOpts = {
  period: GoalPeriod;
  todayKey: string;
  minutesByDate: Record<string, number>;
  dailyGoal: number;
  /** explicit target in minutes; 0 derives from the daily goal */
  goal: number;
  breakDays?: string[];
  weekStart?: 'Monday' | 'Sunday';
};

/**
 * Where the period stands: minutes done, the target, and whether the user is
 * ahead of the straight-line pace for the days elapsed so far.
 */
export function goalProgress(o: GoalOpts) {
  const { from, to } = periodRange(o.period, o.todayKey, o.weekStart);
  const total = practiceDays(from, to, o.breakDays);
  const elapsed = practiceDays(from, o.todayKey < to ? o.todayKey : to, o.breakDays);
  const target = o.goal > 0 ? o.goal : Math.max(0, Math.round(o.dailyGoal) * total);
  const done = periodMinutes(o.minutesByDate, from, o.todayKey < to ? o.todayKey : to);
  // pace = what a straight line through the period would have you at by today
  const pace = total > 0 ? Math.round((target * elapsed) / total) : target;
  return {
    from,
    to,
    done,
    target,
    pace,
    pct: target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0,
    onTrack: done >= pace,
    /** minutes still needed; 0 once the goal is met */
    left: Math.max(0, target - done),
  };
}

/** Whole days from `todayKey` to `targetKey`; negative once it's past. */
export const daysUntil = (targetKey: string, todayKey: string) =>
  Math.round((parse(targetKey).getTime() - parse(todayKey).getTime()) / 86400000);

export type DeadlineOpts = {
  targetDate: string;
  todayKey: string;
  /** ms timestamp the piece was added; falls back to "started today" */
  addedAt?: number;
  stage: number;
  stages: number;
  /** tempo target, with the forecast date the tempo reaches it (null = no forecast) */
  targetBpm?: number;
  tempoReachDate?: string | null;
  /** rolling-average rating target (spec 2026-09-15) and its forecast date */
  targetRating?: number;
  ratingAvg?: number | null;
  ratingReachDate?: string | null;
};

export type LaggingSignal = 'stage' | 'tempo' | 'rating';

/**
 * A piece's "mastered by" deadline: days left, and whether its stage has kept
 * up with the elapsed share of the run-up. Reaching the last stage is done.
 */
export function deadlineStatus(o: DeadlineOpts) {
  const days = daysUntil(o.targetDate, o.todayKey);
  const done = o.stage >= o.stages - 1;
  const startKey = o.addedAt ? key(new Date(o.addedAt)) : o.todayKey;
  const span = Math.max(1, daysUntil(o.targetDate, startKey));
  const gone = Math.min(span, Math.max(0, span - days));
  // progress expected by today vs. the stage actually reached
  const expected = gone / span;
  const actual = (Math.min(o.stage, o.stages - 1) + 1) / o.stages;
  // every signal with a target has to be on pace; a forecast after the deadline (or none) lags
  const lagging: LaggingSignal[] = [];
  if (!done && actual < expected) lagging.push('stage');
  if (o.targetBpm && o.tempoReachDate !== undefined && (o.tempoReachDate === null || o.tempoReachDate > o.targetDate)) lagging.push('tempo');
  if (o.targetRating && (o.ratingAvg ?? 0) < o.targetRating && (!o.ratingReachDate || o.ratingReachDate > o.targetDate)) lagging.push('rating');
  return {
    days,
    done,
    overdue: !done && days < 0,
    // a piece finished on time (or early) is never "behind" on its stage
    onTrack: lagging.length === 0,
    lagging,
  };
}
