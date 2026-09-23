// "Suggested for today" (#95): 2–4 practice segments composed from the signals
// the Progress tab already computes. Pure and deterministic — same state, same
// suggestion — so it needs no storage and scripts/check-suggest.ts can run it in
// node. Nothing here is re-derived: every rule calls the module that owns it.
import { pieceMovement, rankMovement } from './movement-math.ts';
import { focusDrift, goalCalibration, MIN_INSIGHT_DAYS, staleness, tempoForecast } from './stats-math.ts';
import type { Piece, Session } from './store';

export type ReasonKey = 'spotDue' | 'stalled' | 'review' | 'plateau' | 'drift';
export type Suggestion = { focusName: string; kind: 'Piece' | 'Technique'; reasonKey: ReasonKey; min: number; bpm?: number };

export type SuggestInput = {
  pieces: Piece[];
  sessions: Session[];
  minutesByDate: Record<string, number>;
  dailyGoal: number;
  today: string;
  monday: boolean;
  /** How many stages the library has (pieceMovement needs it to tell "due" from "stalled"). */
  stages?: number;
  /** Trouble spots due for review, pre-computed by the caller — optional, so the rule is simply skipped without them. */
  spots?: { pieceName: string; label: string }[];
};

/** Most segments in one suggestion. */
export const MAX_SEGMENTS = 4;
/** Fewer than this and there is no session to suggest. */
export const MIN_SEGMENTS = 2;
/** Every segment is clamped to this range of minutes, rounded down to a multiple of 5. */
export const SEGMENT_MIN = 5;
export const SEGMENT_MAX = 30;

/** Ties break by when the piece was added, then by name — never by array order alone. */
const byAge = (a: Piece, b: Piece) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.name.localeCompare(b.name);

const kindOf = (p: Piece): Suggestion['kind'] => (p.kind === 'Technique' ? 'Technique' : 'Piece');

/**
 * The composer. Rules run in priority order — due spot, stalled, due for
 * review, plateau, drift — one segment each, at most one segment per piece,
 * stopping at MAX_SEGMENTS. Returns null under MIN_INSIGHT_DAYS practised days
 * or with fewer than MIN_SEGMENTS segments found: a thin suggestion is worse
 * than none.
 */
export function suggestSession(input: SuggestInput): { segments: Suggestion[] } | null {
  const { sessions, minutesByDate, today, monday } = input;
  const stages = input.stages ?? 3;
  const practised = Object.keys(minutesByDate).filter((k) => minutesByDate[k] > 0 && k <= today).length;
  if (practised < MIN_INSIGHT_DAYS) return null;

  const live = [...input.pieces].filter((p) => !p.archived).sort(byAge);
  const own = (p: Piece) => sessions.filter((s) => s.title === p.name);
  const picked = new Set<string>();
  const out: Suggestion[] = [];
  const take = (p: Piece, reasonKey: ReasonKey, bpm?: number) => {
    if (picked.has(p.name) || out.length >= MAX_SEGMENTS) return;
    picked.add(p.name);
    out.push({ focusName: p.name, kind: kindOf(p), reasonKey, min: 0, ...(bpm ? { bpm } : {}) });
  };

  // 1. the piece with the most due trouble spots
  if (input.spots?.length) {
    const count = new Map<string, number>();
    for (const sp of input.spots) count.set(sp.pieceName, (count.get(sp.pieceName) ?? 0) + 1);
    const top = live.filter((p) => count.has(p.name)).sort((a, b) => count.get(b.name)! - count.get(a.name)! || byAge(a, b))[0];
    if (top) take(top, 'spotDue');
  }

  // 2. the highest-ranked stalled (or due-for-maintenance) piece
  {
    const moves = rankMovement(live.map((p) => pieceMovement(p, sessions, today, stages)));
    const m = moves.find((x) => (x.move.kind === 'stalled' || x.move.kind === 'due') && !picked.has(x.piece.name));
    if (m) take(m.piece, 'stalled');
  }

  // 3. due for review, most overdue first
  {
    const due = live
      .map((p) => ({ p, st: staleness(own(p).map((s) => s.date), today) }))
      .filter((x) => x.st?.due && !picked.has(x.p.name))
      .sort((a, b) => b.st!.daysSince - a.st!.daysSince || byAge(a.p, b.p))[0];
    if (due) take(due.p, 'review');
  }

  // 4. a tempo plateau short of its target: slow work at the current tempo
  {
    const flat = live.find((p) => {
      if (picked.has(p.name) || !p.targetBpm || !p.currentBpm || p.currentBpm >= p.targetBpm) return false;
      return tempoForecast(p.tempoLog ?? [], p.targetBpm, today, own(p))?.plateau === true;
    });
    if (flat) take(flat, 'plateau', flat.currentBpm);
  }

  // 5. the focus whose share of the week shrank most over the window
  {
    const drift = focusDrift(sessions, today, monday);
    if (drift) {
      const half = Math.floor(drift.weeks.length / 2);
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      const shrunk = drift.series
        .filter((s) => s.title !== '' && !picked.has(s.title))
        .map((s) => ({ title: s.title, shrink: mean(s.share.slice(0, half)) - mean(s.share.slice(half)) }))
        .filter((s) => s.shrink > 0)
        .map((s) => ({ ...s, piece: live.find((p) => p.name === s.title) }))
        .filter((s): s is { title: string; shrink: number; piece: Piece } => !!s.piece)
        .sort((a, b) => b.shrink - a.shrink || byAge(a.piece, b.piece))[0];
      if (shrunk) take(shrunk.piece, 'drift');
    }
  }

  if (out.length < MIN_SEGMENTS) return null;
  const segments = withMinutes(out, budgetFor(input));
  return segments ? { segments } : null;
}

/** The minutes to fill: the daily goal, or the calibrated suggestion when that is lower (#72). */
export function budgetFor(o: { minutesByDate: Record<string, number>; today: string; dailyGoal: number }): number {
  const cal = goalCalibration({ minutesByDate: o.minutesByDate, today: o.today, dailyGoal: o.dailyGoal, weeklyGoal: 0 }).daily;
  return cal ? Math.min(o.dailyGoal, cal.suggested) : o.dailyGoal;
}

/**
 * Split `budget` across the segments, the first getting the largest share
 * (weights n, n-1, …, 1), each rounded down to 5 and clamped to 5..30. The sum
 * never exceeds the budget: trailing segments are dropped while it does, and a
 * budget that cannot hold even two returns null.
 */
export function withMinutes(segments: Suggestion[], budget: number): Suggestion[] | null {
  let list = segments;
  while (list.length >= MIN_SEGMENTS) {
    const n = list.length;
    const total = (n * (n + 1)) / 2;
    const sized = list.map((s, i) => {
      const share = (budget * (n - i)) / total;
      const min = Math.min(SEGMENT_MAX, Math.max(SEGMENT_MIN, Math.floor(share / 5) * 5));
      return { ...s, min };
    });
    if (sized.reduce((a, s) => a + s.min, 0) <= budget) return sized;
    list = list.slice(0, -1);
  }
  return null;
}
