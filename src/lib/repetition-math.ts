// Spaced repetition for trouble spots (#93): a Leitner box per spot. Grading a
// spot after a session moves it down, keeps it, or moves it up a box, and the
// box decides how many days until it is due again. Deliberately simple — five
// boxes, fixed intervals, three buttons — no ease factors. Pure and
// node-runnable, see scripts/check-repetition.ts.
//
// dateKeys ('YYYY-MM-DD') compare lexicographically, so "due" is `dueAt <= today`.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { shiftKey } from './streak-math.ts';

export type SpotGrade = 'again' | 'good' | 'easy';

/** The shape this module needs of a spot — the store's TroubleSpot satisfies it. */
export type ScheduledSpot = { id: string; label: string; box: number; dueAt: string; resolvedAt?: string };
type PieceLike<S extends ScheduledSpot> = { archived?: boolean; spots?: S[] };

/** Days until a spot in box 0..4 comes back. */
export const INTERVALS = [1, 2, 4, 7, 14];
export const MAX_BOX = INTERVALS.length - 1;

const clampBox = (box: number) => Math.min(MAX_BOX, Math.max(0, Math.round(box) || 0));

/** again → down one box (floor 0), good → stays, easy → up one box (ceiling MAX_BOX). */
export function nextBox(box: number, grade: SpotGrade): number {
  const b = clampBox(box);
  if (grade === 'again') return Math.max(0, b - 1);
  if (grade === 'easy') return Math.min(MAX_BOX, b + 1);
  return b;
}

export function intervalFor(box: number): number {
  return INTERVALS[clampBox(box)];
}

/** The spot's new box and due date after `grade` on `today`. */
export function schedule(box: number, grade: SpotGrade, today: string): { box: number; dueAt: string } {
  const next = nextBox(box, grade);
  return { box: next, dueAt: shiftKey(today, intervalFor(next)) };
}

/**
 * Every open spot that is due on or before `today`, on unarchived pieces, soonest
 * first. A spot marked solid (`resolvedAt`) is not due — it is done, not scheduled.
 */
export function dueSpots<S extends ScheduledSpot, P extends PieceLike<S>>(pieces: P[], today: string): { piece: P; spot: S }[] {
  const out: { piece: P; spot: S }[] = [];
  for (const piece of pieces) {
    if (piece.archived) continue;
    for (const spot of piece.spots ?? []) if (!spot.resolvedAt && spot.dueAt <= today) out.push({ piece, spot });
  }
  return out.sort((a, b) => a.spot.dueAt.localeCompare(b.spot.dueAt) || a.spot.label.localeCompare(b.spot.label));
}

/** How many spots on `piece` are due today — the badge count. */
export function dueCount(piece: PieceLike<ScheduledSpot>, today: string): number {
  if (piece.archived) return 0;
  return (piece.spots ?? []).filter((sp) => !sp.resolvedAt && sp.dueAt <= today).length;
}

/**
 * The spots a session review offers for grading: open spots, due ones first
 * (soonest first), then the rest by due date, at most `max`. Sorting by dueAt
 * alone does that — anything due is ≤ today and anything not due is > today.
 */
export function reviewSpots<S extends ScheduledSpot>(spots: S[] | undefined, max = 3): S[] {
  return (spots ?? [])
    .filter((sp) => !sp.resolvedAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.label.localeCompare(b.label))
    .slice(0, max);
}
