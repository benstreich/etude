// Pure helpers behind the piece-first progress definitions (spec 2026-09-15).
// Node-runnable, no React, no Date.now — "today" is always passed in.
import { addDays, calibration, pieceRatings, ratingTrend, type Calibration } from './rating-math.ts';
import type { Piece, Recording, Session, StageEntry } from './store';

/** Append a stage change: ascending, one entry per day (last write wins), no-op when the stage did not change. */
export function appendStageLog(log: StageEntry[] | undefined, date: string, stage: number): StageEntry[] {
  const cur = log ?? [];
  const last = cur[cur.length - 1];
  if (last && last.date === date) return [...cur.slice(0, -1), { date, stage }];
  if (last && last.stage === stage) return cur;
  return [...cur, { date, stage }];
}

const dayNum = (key: string) => Math.round(new Date(key + 'T12:00:00').getTime() / 86_400_000);
const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

export type Movement =
  | { kind: 'stage'; from: number; to: number }
  | { kind: 'tempo'; deltaBpm: number }
  | { kind: 'rating'; delta: number }
  | { kind: 'stalled'; days: number }
  | { kind: 'due'; days: number }
  | { kind: 'new' };

export type PieceMove = {
  piece: Piece;
  move: Movement;
  minutes: number; // practised inside the window
  spark: number[]; // tempo log inside the window, for the sparkline
  target?: number; // target BPM, drawn as a faint line
  ratingFrom?: number;
  ratingTo?: number;
  calibration: Calibration | null;
};

export const STALLED_DAYS = 14;
export const DUE_DAYS = 21;

/** The last date a session named this piece, or null. */
export function lastPlayed(piece: { name: string }, sessions: { title: string; date: string }[]): string | null {
  let last: string | null = null;
  for (const s of sessions) if (s.title === piece.name && (!last || s.date > last)) last = s.date;
  return last;
}

/** One movement verdict per piece; first rule that matches wins (see spec: chip rule order). */
export function pieceMovement(piece: Piece, sessions: Session[], todayKey: string, stagesCount: number, windowDays = 30): PieceMove {
  const cut = addDays(todayKey, -windowDays);
  const own = sessions.filter((s) => s.title === piece.name);
  const minutes = own.filter((s) => s.date >= cut).reduce((a, s) => a + s.min, 0);
  const log = piece.tempoLog ?? [];
  const spark = log.filter((e) => e.date >= cut).map((e) => e.bpm);
  const ratings = pieceRatings(piece, own);
  const trend = ratingTrend(ratings, windowDays, todayKey);
  const base = {
    piece,
    minutes,
    spark,
    target: piece.targetBpm,
    ratingFrom: trend?.from,
    ratingTo: trend?.to,
    calibration: calibration(piece, ratings, todayKey),
  };

  const stageLog = piece.stageLog ?? [];
  for (let i = stageLog.length - 1; i >= 1; i--) {
    if (stageLog[i].date < cut) break;
    if (stageLog[i].stage > stageLog[i - 1].stage) return { ...base, move: { kind: 'stage', from: stageLog[i - 1].stage, to: stageLog[i].stage } };
  }
  if (spark.length >= 2 && spark[spark.length - 1] - spark[0] >= 3) return { ...base, move: { kind: 'tempo', deltaBpm: spark[spark.length - 1] - spark[0] } };
  if (trend && trend.delta >= 0.5) return { ...base, move: { kind: 'rating', delta: trend.delta } };

  const last = lastPlayed(piece, own);
  const idle = last ? daysBetween(last, todayKey) : null;
  if (idle !== null && idle >= DUE_DAYS && piece.stage >= stagesCount - 1) return { ...base, move: { kind: 'due', days: idle } };
  if (idle !== null && idle >= STALLED_DAYS) return { ...base, move: { kind: 'stalled', days: idle } };
  return { ...base, move: { kind: 'new' } };
}

const KIND_ORDER: Movement['kind'][] = ['stage', 'tempo', 'rating', 'stalled', 'due', 'new'];
const size = (m: Movement) => (m.kind === 'stage' ? m.to - m.from : m.kind === 'tempo' ? m.deltaBpm : m.kind === 'rating' ? m.delta : m.kind === 'new' ? 0 : m.days);

/** Movers first (biggest first), then stalled, due, new. */
export function rankMovement(list: PieceMove[]): PieceMove[] {
  return [...list].sort((a, b) => {
    const k = KIND_ORDER.indexOf(a.move.kind) - KIND_ORDER.indexOf(b.move.kind);
    return k !== 0 ? k : size(b.move) - size(a.move);
  });
}

const monthOf = (key: string) => key.slice(0, 7);
const prevMonthOf = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** How many pieces sit in each stage, and how many reached the last stage this month vs. last month. */
export function pipelineCounts(pieces: Piece[], stagesCount: number, todayKey: string) {
  const perStage = Array.from({ length: stagesCount }, () => 0);
  const last = stagesCount - 1;
  const thisM = monthOf(todayKey);
  const lastM = prevMonthOf(todayKey);
  let readyThisMonth = 0;
  let readyLastMonth = 0;
  for (const p of pieces) {
    perStage[Math.min(p.stage, last)]++;
    // the entry that put the piece on the last stage, if it is still there
    const entry = [...(p.stageLog ?? [])].reverse().find((e) => e.stage >= last);
    if (!entry || p.stage < last) continue;
    if (monthOf(entry.date) === thisM) readyThisMonth++;
    else if (monthOf(entry.date) === lastM) readyLastMonth++;
  }
  return { perStage, readyThisMonth, readyLastMonth };
}

/** 1 when played today, fading linearly to 0 at 30 days (or never played). */
export function freshness(lastPlayedKey: string | null, todayKey: string): number {
  if (!lastPlayedKey) return 0;
  return Math.max(0, Math.min(1, 1 - daysBetween(lastPlayedKey, todayKey) / 30));
}

export type MonthDiff = {
  pieces: [number, number];
  promoted: [number, number];
  hours: [number, number];
  bpm: [number, number];
  stars: [number | null, number | null];
};

/** [this month to date, last month over the same day range]: pieces added, stage promotions, hours, BPM gained, average stars. */
export function monthDiff(pieces: Piece[], sessions: Session[], todayKey: string): MonthDiff {
  const thisM = monthOf(todayKey);
  const lastM = prevMonthOf(todayKey);
  const day = todayKey.slice(8);
  const from = [`${thisM}-01`, `${lastM}-01`];
  const to = [todayKey, `${lastM}-${day}`];
  const inRange = (key: string, i: number) => key >= from[i] && key <= to[i];
  const keyOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const out: MonthDiff = { pieces: [0, 0], promoted: [0, 0], hours: [0, 0], bpm: [0, 0], stars: [null, null] };
  for (const i of [0, 1] as const) {
    out.pieces[i] = pieces.filter((p) => p.addedAt && inRange(keyOfMs(p.addedAt), i)).length;
    out.promoted[i] = pieces.reduce((a, p) => {
      const log = p.stageLog ?? [];
      return a + log.filter((e, k) => k > 0 && e.stage > log[k - 1].stage && inRange(e.date, i)).length;
    }, 0);
    const sess = sessions.filter((s) => inRange(s.date, i));
    out.hours[i] = Math.round((sess.reduce((a, s) => a + s.min, 0) / 60) * 10) / 10;
    out.bpm[i] = pieces.reduce((a, p) => {
      const log = (p.tempoLog ?? []).filter((e) => inRange(e.date, i));
      return a + (log.length >= 2 ? Math.max(0, log[log.length - 1].bpm - log[0].bpm) : 0);
    }, 0);
    const rated = sess.filter((s) => typeof s.rating === 'number');
    out.stars[i] = rated.length ? Math.round((rated.reduce((a, s) => a + s.rating!, 0) / rated.length) * 10) / 10 : null;
  }
  return out;
}

/** The pair to listen to: [first, latest]. A starred recording takes the slot on its side; needs ≥ 2 recordings. */
export function recordingPair(recs: Recording[]): [Recording, Recording] | null {
  if (recs.length < 2) return null;
  const sorted = [...recs].sort((a, b) => (a.date === b.date ? (a.at ?? 0) - (b.at ?? 0) : a.date < b.date ? -1 : 1));
  const starred = sorted.filter((r) => r.starred);
  const latest = starred[starred.length - 1] ?? sorted[sorted.length - 1];
  const first = starred.find((r) => r !== latest) ?? sorted.find((r) => r !== latest)!;
  return [first, latest];
}
