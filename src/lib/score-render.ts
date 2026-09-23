// An imported score on the page (#92): measures from lib/musicxml.ts become the
// bars lib/engrave.ts lays out, wrapped into systems the way the practice log's
// full score is — except that here every system carries the clef and key
// signature (a reader of real music expects them on every line), the meter is
// whatever the score says, and a key change mid-system is written where it
// happens. Pure and node-runnable — see scripts/check-score-render.ts.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { BAR_PAD, headerW, justifyLine, KEY_COL_W, layoutBar, METER_COL_W, REST_COL_W, type BarLayout, type Note } from './engrave.ts';
import type { ScoreMeasure } from './musicxml.ts';

/**
 * layoutBar sizes a note as `min / goal` of a whole note. With the goal at 8, a
 * duration in eighths *is* the minutes — every writable value maps exactly, so
 * the practice-log engraver draws an imported score without knowing it.
 */
export const SCORE_GOAL = 8;

export type Meter = { n: number; d: number };

/**
 * Eighths per beam group for a meter: the written beat (8/d eighths), or the
 * dotted beat of a compound meter (6/8, 9/8, 12/8 beam in threes). No meter
 * beams by the quarter, the most common case.
 */
export function beamGroupFor(meter: Meter | null): number {
  if (!meter || meter.d <= 0) return 2;
  const beat = Math.max(1, 8 / meter.d);
  return meter.d >= 8 && meter.n % 3 === 0 ? 3 * beat : beat;
}

/** The engraver's notes for one measure; ids are stable per measure so a re-layout keeps its keys. */
export function barNotes(m: ScoreMeasure, index: number): Note[] {
  return m.notes.map((n, i) => ({
    id: `${index}.${i}`,
    min: n.eighths,
    pitch: n.step,
    ...(n.rest ? { rest: true } : {}),
    ...(n.acc ? { acc: n.acc } : {}),
  }));
}

export type ScoreBar = {
  /** index into the score's measures — the same measure keeps it across re-layouts */
  index: number;
  /** written only where the score changes meter */
  meter: Meter | null;
  /** a key change written inside this bar; null at a system start, where the header carries it */
  keyChange: number | null;
  /** the key in force for the bar's notes */
  sig: number;
  /** null for an empty measure, drawn as a whole rest */
  lay: BarLayout | null;
  natural: number;
  x: number;
  width: number;
};
export type ScoreSystem = { bars: ScoreBar[]; width: number; sig: number; headW: number };

/**
 * Wrap the measures into systems `width` wide. Each system starts with the clef
 * and the key in force at its first bar, so its capacity is what remains; a bar
 * wider than that on its own stands alone at its natural width.
 */
export function layoutScore(measures: ScoreMeasure[], width: number, S: number): ScoreSystem[] {
  const systems: ScoreSystem[] = [];
  let sig = 0;
  let meter: Meter | null = null;
  let line: ScoreBar[] = [];
  let lineSig = 0;
  let lineW = 0;
  const cap = () => Math.max(1, width - headerW(lineSig, S));

  const groups: number[] = []; // beam group per measure index, for the justified re-layout
  const close = (isLast: boolean) => {
    if (!line.length) return;
    const j = justifyLine(line, cap(), isLast);
    // a bar that was widened re-lays its notes into the room it got, so they
    // spread across the bar instead of bunching at its left
    const bars = j.items.map((b) => {
      if (!b.lay) return b;
      const columns = b.natural - b.lay.width;
      const inner = b.width - columns;
      return inner > b.lay.width + 0.01 ? { ...b, lay: layoutBar(barNotes(measures[b.index], b.index), SCORE_GOAL, S, groups[b.index], inner) } : b;
    });
    systems.push({ bars, width: j.width, sig: lineSig, headW: headerW(lineSig, S) });
    line = [];
    lineW = 0;
  };

  measures.forEach((m, index) => {
    const nextSig = m.key !== undefined ? m.key : sig;
    const changed = nextSig !== sig || (index === 0 && m.key !== undefined);
    sig = nextSig;
    if (m.meter) meter = m.meter;
    groups[index] = beamGroupFor(meter);
    const lay = m.notes.length ? layoutBar(barNotes(m, index), SCORE_GOAL, S, groups[index]) : null;
    const body = BAR_PAD(S) + (m.meter ? METER_COL_W(m.meter.n, S, m.meter.d) : 0) + (lay ? lay.width : REST_COL_W(S));
    const bar = (atStart: boolean): ScoreBar => ({
      index,
      meter: m.meter ?? null,
      keyChange: changed && !atStart ? sig : null,
      sig,
      lay,
      natural: body + (changed && !atStart ? KEY_COL_W(sig, S) : 0),
      x: 0,
      width: 0,
    });
    if (line.length && lineW + bar(false).natural > cap()) close(false);
    if (!line.length) lineSig = sig;
    const b = bar(!line.length);
    line.push(b);
    lineW += b.natural;
  });
  close(true);
  return systems;
}
