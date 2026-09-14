// Pure statistics for the Progress tab (#54): session ratings sliced by week,
// focus, time of day and length, plus weekly consistency. Node-runnable
// (scripts/check-stats.ts). Everything degrades to "hide the card" below
// MIN_RATED rated sessions — noise is worse than nothing.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { dateKey } from './streak-math.ts';

export type RatedSession = { title: string; min: number; date: string; rating?: number; at?: number };

/** Fewer rated sessions than this and a rating card stays hidden. */
export const MIN_RATED = 5;

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
