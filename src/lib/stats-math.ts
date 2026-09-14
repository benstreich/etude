// Pure statistics for the Progress tab (#54): session ratings sliced by week,
// focus, time of day and length, plus weekly consistency. Node-runnable
// (scripts/check-stats.ts). Everything degrades to "hide the card" below
// MIN_RATED rated sessions — noise is worse than nothing.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { dateKey } from './streak-math.ts';

export type RatedSession = { title: string; min: number; date: string; rating?: number; at?: number };

/** Fewer rated sessions than this and a rating card stays hidden. */
export const MIN_RATED = 5;
/** Insights (#61) stay hidden under this many practised days — a first week says nothing yet (#77). */
export const MIN_INSIGHT_DAYS = 7;
/** Concentration needs this many sessions before "x % went to n focuses" means anything. */
export const MIN_CONC_SESSIONS = 10;
/** A pace projected from fewer practised days than this in the 8-week window is noise. */
export const MIN_PACE_DAYS = 7;
/** Goal calibration (#72) needs this many practised days / weeks with data in its window. */
export const MIN_CALIBRATION_DAYS = 20;
export const MIN_CALIBRATION_WEEKS = 6;

export const rated = (sessions: RatedSession[]) => sessions.filter((s) => s.rating !== undefined && s.rating > 0);

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export type Bucket = { label: string; n: number; min: number; avgRating: number | null };

const bucketize = (sessions: RatedSession[], labels: string[], pick: (s: RatedSession) => number | null): Bucket[] => {
  const acc = labels.map(() => ({ n: 0, min: 0, ratings: [] as number[] }));
  for (const s of sessions) {
    const i = pick(s);
    if (i === null) continue;
    acc[i].n++;
    acc[i].min += s.min;
    if (s.rating) acc[i].ratings.push(s.rating);
  }
  return acc.map((a, i) => ({ label: labels[i], n: a.n, min: a.min, avgRating: avg(a.ratings) }));
};

/** Monday-start key of the week containing `key` (Sunday when `mondayStart` is false). */
const weekKey = (key: string, mondayStart: boolean) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const shift = mondayStart ? (dt.getDay() + 6) % 7 : dt.getDay();
  dt.setDate(dt.getDate() - shift);
  return dateKey(dt);
};

export type WeekPoint = { week: string; min: number; avgRating: number | null };

/** Last `weeks` calendar weeks ending with the week of `today`: minutes and average rating per week. */
export function ratingByWeek(sessions: RatedSession[], today: string, mondayStart: boolean, weeks = 12): WeekPoint[] {
  const first = weekKey(today, mondayStart);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const [y, m, d] = first.split('-').map(Number);
    keys.push(dateKey(new Date(y, m - 1, d - 7 * i)));
  }
  const idx = new Map(keys.map((k, i) => [k, i]));
  const b = bucketize(sessions, keys, (s) => idx.get(weekKey(s.date, mondayStart)) ?? null);
  return b.map((x) => ({ week: x.label, min: x.min, avgRating: x.avgRating }));
}

export type FocusStat = { title: string; n: number; min: number; avgRating: number | null };

/** Per piece/technique: sessions, minutes, average rating (null below 3 rated). Sorted by minutes. */
export function ratingByFocus(sessions: RatedSession[]): FocusStat[] {
  const by: Record<string, { n: number; min: number; ratings: number[] }> = {};
  for (const s of sessions) {
    const f = (by[s.title] ??= { n: 0, min: 0, ratings: [] });
    f.n++;
    f.min += s.min;
    if (s.rating) f.ratings.push(s.rating);
  }
  return Object.entries(by)
    .map(([title, f]) => ({ title, n: f.n, min: f.min, avgRating: f.ratings.length >= 3 ? avg(f.ratings) : null }))
    .sort((a, b) => b.min - a.min);
}

export const TIME_OF_DAY = ['morning', 'afternoon', 'evening'];

/** Sessions with a start timestamp bucketed by local hour: <12, 12–17, 18+. */
export const byTimeOfDay = (sessions: RatedSession[]) =>
  bucketize(sessions, TIME_OF_DAY, (s) => {
    if (s.at === undefined) return null;
    const h = new Date(s.at).getHours();
    return h < 12 ? 0 : h < 18 ? 1 : 2;
  });

export const LENGTHS = ['0–15', '15–30', '30–45', '45–60', '60+'];

/** Session-length histogram; the label is the upper bound exclusive (a 15-minute session is "15–30"). */
export const byLength = (sessions: RatedSession[]) =>
  bucketize(sessions, LENGTHS, (s) => Math.min(4, Math.floor(s.min / 15)));

export type Consistency = { perWeek: number[]; current: number; average: number };

/** Days practised per calendar week for the last `weeks` weeks (oldest first); `average` excludes the current week. */
export function consistency(minutesByDate: Record<string, number>, today: string, mondayStart: boolean, weeks = 12): Consistency {
  const points = ratingByWeek(
    Object.entries(minutesByDate)
      .filter(([, m]) => m > 0)
      .map(([date]) => ({ title: '', min: 1, date })),
    today,
    mondayStart,
    weeks,
  );
  const perWeek = points.map((p) => p.min);
  const past = perWeek.slice(0, -1).filter((_, i, arr) => i >= arr.findIndex((x) => x > 0)); // from the first active week
  const average = past.length ? Math.round((past.reduce((a, b) => a + b, 0) / past.length) * 10) / 10 : 0;
  return { perWeek, current: perWeek[perWeek.length - 1], average };
}

export type RatingSummary = { avgRating: number | null; bestPiece: string | null };

/** Recap rows: overall average and the best-rated focus (needs 3 rated sessions). Null-safe below MIN_RATED. */
export function ratingSummary(sessions: RatedSession[]): RatingSummary {
  const r = rated(sessions);
  if (r.length < MIN_RATED) return { avgRating: null, bestPiece: null };
  const best = ratingByFocus(r)
    .filter((f) => f.avgRating !== null)
    .sort((a, b) => b.avgRating! - a.avgRating! || b.min - a.min)[0];
  return { avgRating: avg(r.map((s) => s.rating!)), bestPiece: best?.title ?? null };
}

/** Minutes practised per BPM gained since the first tempo entry; null when no gain or under 2 entries. */
export function minPerBpm(log: { date: string; bpm: number }[], sessions: { min: number; date: string }[]): number | null {
  if (log.length < 2) return null;
  const gain = log[log.length - 1].bpm - log[0].bpm;
  if (gain <= 0) return null;
  const min = sessions.filter((s) => s.date >= log[0].date).reduce((a, s) => a + s.min, 0);
  return min > 0 ? Math.round(min / gain) : null;
}

// ---------------------------------------------------------------------------
// #61 insights — every function returns null when the data is too thin to say
// anything; the Progress tab simply drops that card.

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const shiftKey = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
};
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export type TempoForecast = { bpmPerWeek: number; reachDate: string | null; plateau: boolean };

/**
 * Learning curve for one piece. ponytail: a straight-line fit, not a logistic —
 * the tempo log is one point per day and rarely long enough to bend. Hidden
 * under 4 entries or 14 days of span. `reachDate` is null when the target is
 * already met, unset, or the trend is flat/negative. `plateau`: at least 60 min
 * of sessions in the last 3 weeks and no BPM above the pre-window best.
 */
export function tempoForecast(
  log: { date: string; bpm: number }[],
  target: number | undefined,
  today: string,
  sessions: { min: number; date: string }[],
): TempoForecast | null {
  if (log.length < 4 || daysBetween(log[0].date, log[log.length - 1].date) < 14) return null;
  const xs = log.map((e) => daysBetween(log[0].date, e.date));
  const ys = log.map((e) => e.bpm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  const last = ys[ys.length - 1];
  let reachDate: string | null = null;
  if (target && slope > 0 && last < target) reachDate = shiftKey(log[log.length - 1].date, Math.ceil((target - last) / slope));
  const windowStart = shiftKey(today, -21);
  const before = log.filter((e) => e.date < windowStart);
  const recentBest = Math.max(0, ...log.filter((e) => e.date >= windowStart).map((e) => e.bpm));
  const recentMin = sessions.filter((s) => s.date >= windowStart).reduce((a, s) => a + s.min, 0);
  const plateau = before.length > 0 && recentMin >= 60 && recentBest <= Math.max(...before.map((e) => e.bpm));
  return { bpmPerWeek: Math.round(slope * 7 * 10) / 10, reachDate, plateau };
}

export type Staleness = { daysSince: number; medianGap: number | null; due: boolean };

/** Days since a piece was last practised and its usual revisit gap; `due` past twice the gap (14 days minimum). */
export function staleness(dates: string[], today: string): Staleness | null {
  const uniq = [...new Set(dates)].sort();
  if (!uniq.length) return null;
  const gaps = uniq.slice(1).map((d, i) => daysBetween(uniq[i], d));
  const medianGap = median(gaps);
  const daysSince = daysBetween(uniq[uniq.length - 1], today);
  return { daysSince, medianGap, due: daysSince > Math.max(14, 2 * (medianGap ?? 0)) };
}

export type Driver = { dim: 'timeOfDay' | 'length' | 'weekend' | 'routine'; best: string; gap: number };

/**
 * What separates the well-rated sessions: per dimension, the best group only
 * counts when both sides have at least 8 rated sessions and the gap is 0.5 stars or more.
 */
export function qualityDrivers(sessions: (RatedSession & { planId?: string })[]): Driver[] {
  const r = rated(sessions);
  const hourBucket = (at: number) => {
    const h = new Date(at).getHours();
    return TIME_OF_DAY[h < 12 ? 0 : h < 18 ? 1 : 2];
  };
  const dims: { dim: Driver['dim']; group: (s: RatedSession & { planId?: string }) => string | null }[] = [
    { dim: 'timeOfDay', group: (s) => (s.at === undefined ? null : hourBucket(s.at)) },
    { dim: 'length', group: (s) => LENGTHS[Math.min(4, Math.floor(s.min / 15))] },
    { dim: 'weekend', group: (s) => ([0, 6].includes(new Date(s.date + 'T12:00:00').getDay()) ? 'weekend' : 'weekday') },
    { dim: 'routine', group: (s) => (s.planId ? 'routine' : 'free') },
  ];
  const out: Driver[] = [];
  for (const { dim, group } of dims) {
    const by: Record<string, number[]> = {};
    for (const s of r) {
      const g = group(s);
      if (g !== null) (by[g] ??= []).push(s.rating!);
    }
    const all = Object.values(by).flat();
    const sumAll = all.reduce((p, q) => p + q, 0);
    let best: Driver | null = null;
    for (const [label, xs] of Object.entries(by)) {
      const rest = all.length - xs.length;
      if (xs.length < 8 || rest < 8) continue;
      const sum = xs.reduce((p, q) => p + q, 0);
      const gap = Math.round((sum / xs.length - (sumAll - sum) / rest) * 10) / 10;
      if (gap >= 0.5 && (!best || gap > best.gap)) best = { dim, best: label, gap };
    }
    if (best) out.push(best);
  }
  return out;
}

export type Concentration = { pct: number; top: number; total: number };

/** Share of minutes held by the fewest focuses that reach 80 %; null under 3 focuses or MIN_CONC_SESSIONS sessions. */
export function concentration(sessions: { title: string; min: number }[]): Concentration | null {
  const by: Record<string, number> = {};
  for (const s of sessions) by[s.title] = (by[s.title] ?? 0) + s.min;
  const mins = Object.values(by).sort((a, b) => b - a);
  const total = mins.reduce((a, b) => a + b, 0);
  if (sessions.length < MIN_CONC_SESSIONS || mins.length < 3 || !total) return null;
  let acc = 0;
  let top = 0;
  while (acc / total < 0.8) acc += mins[top++];
  return { pct: Math.round((acc / total) * 100), top, total: mins.length };
}

export type StreakSurvival = { count: number; typicalLength: number; breakWeekday: number; lengths: number[] };

/**
 * Past streaks (runs of consecutive practised days that have ended): their
 * typical length and the weekday they most often break on (0 = Sunday, the
 * first missed day). ponytail: plain consecutive days, break-day and grace
 * settings ignored. null under 3 ended streaks.
 */
export function streakSurvival(minutesByDate: Record<string, number>, today: string): StreakSurvival | null {
  const days = Object.keys(minutesByDate).filter((k) => minutesByDate[k] > 0 && k < today).sort();
  const runs: { len: number; end: string }[] = [];
  let len = 0;
  for (let i = 0; i < days.length; i++) {
    len = i > 0 && daysBetween(days[i - 1], days[i]) === 1 ? len + 1 : 1;
    const next = days[i + 1];
    // a run reaching yesterday is still alive — it hasn't broken yet
    if ((!next || daysBetween(days[i], next) > 1) && daysBetween(days[i], today) > 1) runs.push({ len, end: days[i] });
  }
  if (runs.length < 3) return null;
  const counts: Record<number, number> = {};
  for (const r of runs) {
    const wd = new Date(shiftKey(r.end, 1) + 'T12:00:00').getDay();
    counts[wd] = (counts[wd] ?? 0) + 1;
  }
  const breakWeekday = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  return { count: runs.length, typicalLength: Math.round(median(runs.map((r) => r.len))!), breakWeekday, lengths: runs.map((r) => r.len) };
}

export type Projection = { hoursByYearEnd: number; milestoneH: number | null; milestoneDate: string | null };

/** Year-end hours at the last 8 weeks' pace, and when the next round milestone lands. null under MIN_PACE_DAYS practised days in the window. */
export function projection(minutesByDate: Record<string, number>, totalMin: number, today: string): Projection | null {
  const from = shiftKey(today, -55);
  let recent = 0;
  let recentDays = 0;
  let yearMin = 0;
  for (const [k, m] of Object.entries(minutesByDate)) {
    if (k >= from && k <= today) {
      recent += m;
      if (m > 0) recentDays++;
    }
    if (k.startsWith(today.slice(0, 4)) && k <= today) yearMin += m;
  }
  const perDay = recent / 56;
  if (perDay <= 0 || recentDays < MIN_PACE_DAYS) return null;
  const hoursByYearEnd = Math.round((yearMin + perDay * daysBetween(today, `${today.slice(0, 4)}-12-31`)) / 60);
  const milestoneH = [10, 25, 50, 100, 250, 500, 1000, 2500].find((h) => h * 60 > totalMin) ?? null;
  const milestoneDate = milestoneH ? shiftKey(today, Math.ceil((milestoneH * 60 - totalMin) / perDay)) : null;
  return { hoursByYearEnd, milestoneH, milestoneDate };
}

export type Calibration = { goal: number; suggested: number; hitCurrent: number; hitSuggested: number; n: number };

const percentile60 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.6 * s.length) - 1)];
};
const hitRate = (xs: number[], goal: number) => Math.round((xs.filter((x) => x >= goal).length / xs.length) * 100);

/**
 * One goal against what actually happened (#72): the 60th percentile of the
 * totals, rounded to `step`, is a goal you clear more often than not without
 * being trivial. null when the goal is unset, the sample is too small, or the
 * suggestion is within one step of the goal — nothing to say then.
 */
function calibrate(values: number[], goal: number, step: number, minN: number): Calibration | null {
  if (goal <= 0 || values.length < minN) return null;
  const suggested = Math.max(step, Math.round(percentile60(values) / step) * step);
  if (Math.abs(suggested - goal) < step) return null;
  return { goal, suggested, hitCurrent: hitRate(values, goal), hitSuggested: hitRate(values, suggested), n: values.length };
}

/**
 * Daily goal against the practised days of the last 8 weeks, weekly goal against
 * the last 8 completed weeks that had any practice. Zero days are left out of
 * the daily sample on purpose: the question is "how much on a day I show up",
 * consistency is measured elsewhere.
 */
export function goalCalibration(o: {
  minutesByDate: Record<string, number>;
  today: string;
  dailyGoal: number;
  weeklyGoal: number;
  weekStart?: 'Monday' | 'Sunday';
}): { daily: Calibration | null; weekly: Calibration | null } {
  const from = shiftKey(o.today, -55);
  const days = Object.entries(o.minutesByDate)
    .filter(([k, m]) => k >= from && k <= o.today && m > 0)
    .map(([, m]) => m);
  const daily = calibrate(days, o.dailyGoal, 5, MIN_CALIBRATION_DAYS);

  // start of the current week, then the 8 whole weeks before it
  const startDow = o.weekStart === 'Sunday' ? 0 : 1;
  let weekStart = o.today;
  while (new Date(weekStart + 'T12:00:00').getDay() !== startDow) weekStart = shiftKey(weekStart, -1);
  const weeks: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const a = shiftKey(weekStart, -7 * i);
    const b = shiftKey(a, 6);
    let total = 0;
    for (const [k, m] of Object.entries(o.minutesByDate)) if (k >= a && k <= b) total += m;
    if (total > 0) weeks.push(total);
  }
  const weekly = calibrate(weeks, o.weeklyGoal, 15, MIN_CALIBRATION_WEEKS);
  return { daily, weekly };
}

export type FocusDrift = { weeks: string[]; series: { title: string; share: number[] }[] };

/**
 * Stacked weekly share per focus over the last `weeks` calendar weeks (#71): the
 * `top` focuses by minutes in the window, everything else folded into '' (the
 * caller labels it "Other"). Shares within a week sum to 1; an empty week is all
 * zeros. null under 2 focuses or 4 weeks with practice — no drift to show yet.
 */
export function focusDrift(sessions: { title: string; min: number; date: string }[], today: string, mondayStart: boolean, weeks = 12, top = 4): FocusDrift | null {
  const first = weekKey(today, mondayStart);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(shiftKey(first, -7 * i));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const byTitle: Record<string, number[]> = {};
  const totals = keys.map(() => 0);
  for (const s of sessions) {
    const w = idx.get(weekKey(s.date, mondayStart));
    if (w === undefined) continue;
    (byTitle[s.title] ??= keys.map(() => 0))[w] += s.min;
    totals[w] += s.min;
  }
  const titles = Object.keys(byTitle).sort((a, b) => byTitle[b].reduce((x, y) => x + y, 0) - byTitle[a].reduce((x, y) => x + y, 0));
  if (titles.length < 2 || totals.filter((t) => t > 0).length < 4) return null;
  const keep = titles.slice(0, top);
  const rest = titles.slice(top);
  const series = keep.map((title) => ({ title, share: byTitle[title].map((m, w) => (totals[w] ? m / totals[w] : 0)) }));
  if (rest.length) series.push({ title: '', share: keys.map((_, w) => (totals[w] ? rest.reduce((a, t) => a + byTitle[t][w], 0) / totals[w] : 0)) });
  return { weeks: keys, series };
}

/** Minutes per calendar week for the last `weeks` weeks, oldest first, the current week last. */
export function weeklyTotals(minutesByDate: Record<string, number>, today: string, mondayStart: boolean, weeks = 12): number[] {
  const first = weekKey(today, mondayStart);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(shiftKey(first, -7 * i));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const out = keys.map(() => 0);
  for (const [k, m] of Object.entries(minutesByDate)) {
    const w = idx.get(weekKey(k, mondayStart));
    if (w !== undefined) out[w] += m;
  }
  return out;
}

/** Trailing mean over the last `n` points; null until `n` points exist. */
export const rollingMean = (xs: number[], n = 4): (number | null)[] =>
  xs.map((_, i) => (i + 1 < n ? null : Math.round(xs.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n)));

export type Interleaving = { perDay: number; perWeek: number };

/**
 * How many distinct focuses a practice day and a practice week touch, over the last
 * `weeks` weeks (#61 §2). The practice literature favours several short blocks
 * over one long one; this is the number, the guide explains why. null under 7 practised days.
 */
export function interleaving(sessions: { title: string; date: string }[], today: string, mondayStart: boolean, weeks = 8): Interleaving | null {
  const from = shiftKey(weekKey(today, mondayStart), -7 * (weeks - 1));
  const byDay: Record<string, Set<string>> = {};
  const byWeek: Record<string, Set<string>> = {};
  for (const s of sessions) {
    if (s.date < from || s.date > today) continue;
    (byDay[s.date] ??= new Set()).add(s.title);
    (byWeek[weekKey(s.date, mondayStart)] ??= new Set()).add(s.title);
  }
  const days = Object.values(byDay);
  if (days.length < 7) return null;
  const mean = (sets: Set<string>[]) => Math.round((sets.reduce((a, x) => a + x.size, 0) / sets.length) * 10) / 10;
  return { perDay: mean(days), perWeek: mean(Object.values(byWeek)) };
}
