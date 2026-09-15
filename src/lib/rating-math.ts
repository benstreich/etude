// Stars are the grade. A piece's rating log is derived from the sessions that
// name it (session.title === piece.name) — nothing new is captured.
import type { TempoEntry } from './store';

export type RatingEntry = { date: string; rating: number };
export type Calibration = 'grading-feel' | 'not-speed' | 'hard-days-count';

export const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayNum = (key: string) => Math.round(new Date(key + 'T12:00:00').getTime() / 86_400_000);

export function pieceRatings(piece: { name: string }, sessions: { title: string; date: string; rating?: number; at?: number }[]): RatingEntry[] {
  return sessions
    .filter((s) => s.title === piece.name && typeof s.rating === 'number')
    .sort((a, b) => (a.date === b.date ? (a.at ?? 0) - (b.at ?? 0) : a.date < b.date ? -1 : 1))
    .map((s) => ({ date: s.date, rating: s.rating! }));
}

/** Rolling average of the last n rated sessions; null under 2 ratings. */
export function rollingAvg(ratings: RatingEntry[], n = 5): number | null {
  if (ratings.length < 2) return null;
  const tail = ratings.slice(-n);
  return tail.reduce((a, r) => a + r.rating, 0) / tail.length;
}

export function ratingTrend(ratings: RatingEntry[], windowDays: number, todayKey: string): { from: number; to: number; delta: number } | null {
  const cut = addDays(todayKey, -windowDays);
  const before = ratings.filter((r) => r.date <= cut);
  const from = rollingAvg(before.length >= 2 ? before : ratings.slice(0, 2));
  const to = rollingAvg(ratings);
  if (from === null || to === null) return null;
  return { from, to, delta: to - from };
}

/** Least squares over the rolling average of the last 8 weeks; mirrors tempoForecast. */
export function ratingForecast(ratings: RatingEntry[], target: number, todayKey: string): { reachDate: string } | null {
  const cut = addDays(todayKey, -56);
  const recent = ratings.filter((r) => r.date >= cut);
  if (recent.length < 3) return null;
  const pts = recent.map((e, i) => ({ x: dayNum(e.date), y: rollingAvg(recent.slice(0, i + 1)) ?? e.rating }));
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  if (slope <= 1e-6) return null;
  const last = pts[n - 1];
  if (last.y >= target) return { reachDate: todayKey };
  const days = Math.ceil((target - last.y) / slope);
  return { reachDate: addDays(recent[n - 1].date, Math.min(days, 730)) };
}

export function calibration(
  p: { tempoLog?: TempoEntry[]; targetBpm?: number; currentBpm?: number },
  ratings: RatingEntry[],
  todayKey: string,
): Calibration | null {
  const avg = rollingAvg(ratings);
  if (avg === null) return null;
  const cut = addDays(todayKey, -30);
  const log = p.tempoLog ?? [];
  const inWin = log.filter((e) => e.date >= cut);
  const tempoDelta = inWin.length >= 2 ? inWin[inWin.length - 1].bpm - inWin[0].bpm : 0;
  const trend = ratingTrend(ratings, 30, todayKey);
  const atTarget = !!p.targetBpm && (p.currentBpm ?? log[log.length - 1]?.bpm ?? 0) >= p.targetBpm;
  if (atTarget && avg <= 3) return 'not-speed';
  if (avg <= 2.5 && ((trend && trend.delta > 0) || tempoDelta > 0)) return 'hard-days-count';
  if (trend && trend.delta >= 0.5 && inWin.length >= 2 && tempoDelta <= 0) return 'grading-feel';
  return null;
}
