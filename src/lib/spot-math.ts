// Per-spot practice stats (#91): the minutes a trouble spot has had, when it was
// last worked on, and whether it is getting more or less attention. Pure and
// node-runnable — see scripts/check-spot.ts.
//
// Sessions join pieces by display name and spots by id (a spot id is stable
// across a piece rename, a name is not), so both keys come in as arguments.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { shiftKey } from './streak-math.ts';

export type SpotStats = { min: number; last: string | null; trend: 'up' | 'down' | 'flat' };

/** Two 14-day windows: the one ending today, and the one before it. */
export const TREND_WINDOW_DAYS = 14;
/** Up from 1.25× the previous window's minutes, down from 0.75× (inclusive at both ends). */
export const TREND_UP = 1.25;
export const TREND_DOWN = 0.75;

/**
 * Stats for one spot of one piece. `trend` compares the last 14 days against the
 * 14 before: 'up' at ≥ 1.25×, 'down' at ≤ 0.75×, otherwise 'flat' — and 'flat'
 * when neither window has any minutes, so a spot never opens with an arrow.
 */
export function spotStats(
  sessions: { title: string; date: string; min: number; spot?: string }[],
  pieceName: string,
  spotId: string,
  today: string,
): SpotStats {
  let min = 0;
  let last: string | null = null;
  let recent = 0;
  let before = 0;
  const recentFrom = shiftKey(today, -(TREND_WINDOW_DAYS - 1));
  const beforeFrom = shiftKey(today, -(2 * TREND_WINDOW_DAYS - 1));
  for (const s of sessions) {
    if (s.title !== pieceName || s.spot !== spotId) continue;
    min += s.min;
    if (last === null || s.date > last) last = s.date;
    if (s.date > today) continue; // a backdated log lands in the past, never the future — but be safe
    if (s.date >= recentFrom) recent += s.min;
    else if (s.date >= beforeFrom) before += s.min;
  }
  let trend: SpotStats['trend'] = 'flat';
  if (recent > 0 || before > 0) {
    if (recent >= before * TREND_UP) trend = 'up';
    else if (recent <= before * TREND_DOWN) trend = 'down';
  }
  return { min, last, trend };
}
