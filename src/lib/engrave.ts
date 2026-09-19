// Engraving for the Home staff: where every head, stem, beam and dot lands.
// The notation font only draws stems up, which is wrong for half the staff and
// cannot beam at all, so the notes are drawn rather than typed — this works out
// the geometry and components/motifs.tsx puts it on screen. Everything is in
// multiples of the staff space S, the way engravers size a score, with y = 0 on
// the top staff line. Pure and node-runnable — see scripts/check-engrave.ts.

import { eighthsFor, meterFor, valueFor, type Head } from './melody.ts';

/** Staff positions are half-spaces; index 4 (B4) sits on the middle line. */
export const yOf = (pitch: number, S: number) => 2 * S - (pitch - 4) * (S / 2);

// Engraving proportions, all against the staff space. These are the numbers a
// score is built from: a head is a little over a space wide, a stem a seventh of
// one thick and three and a half spaces long, a beam half a space.
export const LINE_W = (S: number) => 0.13 * S;
export const STEM_W = (S: number) => 0.12 * S;
export const BEAM_T = (S: number) => 0.5 * S;
const STEM_LEN = (S: number) => 3.5 * S;
/** Head half-width; the wide ones are the open heads that carry no stem. */
export const headRx = (head: Head, S: number) => (head === 'whole' || head === 'breve' ? 0.85 * S : 0.66 * S);
export const HEAD_RY = (S: number) => 0.5 * S;
/** Open heads are drawn as a ring: an outer ellipse with this one punched out of it. */
export const holeRx = (head: Head, S: number) => (head === 'whole' || head === 'breve' ? 0.46 * S : 0.36 * S);
export const holeRy = (head: Head, S: number) => (head === 'whole' || head === 'breve' ? 0.23 * S : 0.17 * S);
/** Heads lean, the way a broad nib leaves them. */
export const HEAD_TILT = -21;

/** A note earns room by its length — the long ones breathe, as engraved music does. */
const advance = (f: number, S: number) => (f >= 1 ? 2.15 * S : f >= 1 / 2 ? 1.8 * S : 1.5 * S);
/** Space between the barline and the bar's first head. */
const LEAD = (S: number) => 0.85 * S;

export type Placed = {
  id: string;
  x: number;
  y: number;
  head: Head;
  /** null for the open heads, which carry none */
  stem: { x: number; y1: number; y2: number } | null;
  /** an eighth that ended up alone keeps its flag; a beamed one gives it up */
  flag: boolean;
  down: boolean;
  dot: { x: number; y: number } | null;
};
export type Beam = { x1: number; y1: number; x2: number; y2: number; down: boolean };
export type BarLayout = { width: number; notes: Placed[]; beams: Beam[] };

type Note = { id: string; min: number; pitch: number };

/**
 * Lay a bar out. Stems point down on or above the middle line and up below it,
 * the ordinary rule; a run of adjacent eighths is beamed instead of flagged, and
 * the whole run takes one direction so the beam has somewhere to sit.
 */
export function layoutBar(notes: Note[], goal: number, S: number): BarLayout {
  const stemLen = STEM_LEN(S);
  const stemW = STEM_W(S);

  const vals = notes.map((n) => ({ n, v: valueFor(n.min, goal) }));
  let x = LEAD(S);
  const placed = vals.map((p, i) => {
    const at = x;
    // a note earns room by its length, but never less than the two heads need
    // between them — an open head after an eighth is wider than its value says
    const next = vals[i + 1];
    const clear = headRx(p.v.head, S) + (next ? headRx(next.v.head, S) + 0.45 * S : 0.6 * S);
    x += Math.max(advance(p.v.f, S), clear);
    return { n: p.n, v: p.v, x: at, y: yOf(p.n.pitch, S), down: p.n.pitch >= 4 };
  });

  // runs of two or more adjacent eighths beam together
  const runs: (typeof placed)[] = [];
  let run: typeof placed = [];
  for (const p of placed) {
    if (p.v.head === 'eighth' && !p.v.dotted) run.push(p);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  const beamed = new Set(runs.flat());

  // a run takes the direction most of its notes wanted, so one beam serves them all
  const beams: Beam[] = [];
  for (const r of runs) {
    const down = r.filter((p) => p.down).length * 2 >= r.length;
    const end = (p: (typeof r)[number]) => (down ? p.y + stemLen : p.y - stemLen);
    const y1 = end(r[0]);
    // engravers cap the slope: a beam that chases every leap is unreadable
    const y2 = y1 + Math.max(-S, Math.min(S, end(r[r.length - 1]) - y1));
    for (const p of r) p.down = down;
    beams.push({ x1: stemX(r[0], down, S, stemW), y1, x2: stemX(r[r.length - 1], down, S, stemW) + stemW, y2, down });
  }
  const beamY = (p: (typeof placed)[number]) => {
    const b = beams[runs.findIndex((r) => r.includes(p))];
    const r = runs.find((x2) => x2.includes(p))!;
    const i = r.indexOf(p);
    return r.length === 1 ? b.y1 : b.y1 + ((b.y2 - b.y1) * i) / (r.length - 1);
  };

  const out: Placed[] = placed.map((p) => {
    const open = p.v.head === 'whole' || p.v.head === 'breve';
    const stem = open
      ? null
      : { x: stemX(p, p.down, S, stemW), y1: p.y, y2: beamed.has(p) ? beamY(p) : p.down ? p.y + stemLen : p.y - stemLen };
    // a dot never sits on a staff line — on a line it rides into the space above
    const dot = p.v.dotted ? { x: p.x + headRx(p.v.head, S) + 0.42 * S, y: p.y - (p.n.pitch % 2 === 0 ? S / 2 : 0) } : null;
    return { id: p.n.id, x: p.x, y: p.y, head: p.v.head, stem, flag: p.v.head === 'eighth' && !beamed.has(p), down: p.down, dot };
  });

  return { width: x, notes: out, beams };
}

/** A stem rides the right edge of its head going up, the left edge going down. */
function stemX(p: { x: number; v: { head: Head } }, down: boolean, S: number, stemW: number) {
  const r = headRx(p.v.head, S) - 0.03 * S;
  return down ? p.x - r : p.x + r - stemW;
}

/** The flag on a lone eighth, hung off the end of its stem. */
export function flagPath(x: number, y: number, down: boolean, S: number): string {
  const d = down ? 1 : -1;
  return `M ${x} ${y} c ${d * 0.75 * S} ${d * 0.3 * S} ${d * 0.85 * S} ${d * 0.75 * S} ${d * 0.2 * S} ${d * 1.45 * S} c ${d * 0.4 * S} ${-d * 0.78 * S} ${-d * 0.08 * S} ${-d * 0.95 * S} ${-d * 0.2 * S} ${-d * 1.05 * S} z`;
}

// --- the clef and key signature, the part that never scrolls ---------------

/** Staff position of each sharp in a treble key signature, in the order they are added. */
const SHARP_AT: Record<string, number> = { F: 8, C: 5, G: 10, D: 6, A: 3, E: 7, B: 4 };
const FLAT_AT: Record<string, number> = { B: 4, E: 7, A: 3, D: 6, G: 2, C: 5, F: 1 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Where each accidental of the signature goes; `sig` is sharps (+) or flats (−). */
export function signatureMarks(sig: number, S: number): { x: number; y: number; sharp: boolean }[] {
  const letters = sig > 0 ? SHARP_ORDER.slice(0, sig) : FLAT_ORDER.slice(0, -sig);
  return letters.map((l, i) => ({
    x: 3.05 * S + i * 0.72 * S,
    y: yOf(sig > 0 ? SHARP_AT[l] : FLAT_AT[l], S),
    sharp: sig > 0,
  }));
}

/** Width of the clef-and-signature block, which is pinned to the left of the staff. */
export const headerW = (sig: number, S: number) => 3.05 * S + Math.abs(sig) * 0.72 * S + 0.5 * S;

// --- the full score: bars wrapped into systems down the page ---------------

/** A bar's fixed column overhead — a barline and its breathing room. */
export const BAR_PAD = (S: number) => 0.4 * S;
/** The time-signature column, only present where the meter is written. */
export const METER_COL_W = (S: number) => 1.45 * S;
/** A day off — one rest column. */
export const REST_COL_W = (S: number) => 2.2 * S;
/** The eighth rest that squares a bar with the meter it claims. */
export const PAD_COL_W = (S: number) => 1.6 * S;

type LogBar = { date: string; notes: { id: string; min: number; pitch: number }[] };

export type SysBar = {
  date: string;
  /** written only where the meter changes across the whole log, never per system */
  meter: number | null;
  /** null = a day off (a rest) */
  lay: BarLayout | null;
  pad: number;
  x: number;
  width: number;
};
export type System = { bars: SysBar[]; width: number };

/**
 * Bars wrapped into systems the way a page of engraved music is: walk them in
 * date order, close a system when the next bar would overflow the line, then
 * spread each system's slack across its own bars in proportion to their
 * natural width — the same "a longer note gets more room" idea `layoutBar`
 * already applies inside one bar. The meter is a property of the log, so it
 * is tracked once across every bar and never restated just because a system
 * broke.
 *
 * Wrapping is bar-granular, not column-granular: a day holds at most a
 * handful of sessions (`MAX_NOTES` in lib/melody.ts), nothing like a dense
 * orchestral bar, so every system can close on a barline — no bar has ever
 * been observed wide enough on its own to need a break mid-bar, and this
 * does not attempt one. A bar wider than the page on its own (an
 * unrealistic number of same-day sessions) is left at its natural width
 * rather than compressed; it is the one case this layout does not promise
 * to keep inside `capacity`.
 */
export function layoutSystems(bars: LogBar[], goal: number, capacity: number, S: number, firstCapacity = capacity): System[] {
  let prevMeter = 0;
  const items = bars.map((b) => {
    const m = meterFor(eighthsFor(b.notes, goal));
    const meter = m && m.beats !== prevMeter ? m.beats : null;
    if (m) prevMeter = m.beats;
    const lay = b.notes.length ? layoutBar(b.notes, goal, S) : null;
    const pad = m?.padEighths ?? 0;
    const natural = BAR_PAD(S) + (meter !== null ? METER_COL_W(S) : 0) + (lay ? lay.width : REST_COL_W(S)) + (pad ? PAD_COL_W(S) : 0);
    return { date: b.date, meter, lay, pad, natural };
  });

  type Item = (typeof items)[number];
  const closeSystem = (line: Item[], naturalTotal: number, cap: number, isLast: boolean): System => {
    // the last system stays ragged unless it's already mostly full — the printed convention
    const justify = !isLast || (cap > 0 && naturalTotal / cap > 0.6);
    const slack = justify ? Math.max(0, cap - naturalTotal) : 0;
    let x = 0;
    const out: SysBar[] = line.map((it) => {
      const width = it.natural + (naturalTotal > 0 ? (it.natural / naturalTotal) * slack : 0);
      const bar: SysBar = { date: it.date, meter: it.meter, lay: it.lay, pad: it.pad, x, width };
      x += width;
      return bar;
    });
    return { bars: out, width: justify ? cap : naturalTotal };
  };

  const systems: System[] = [];
  let line: Item[] = [];
  let lineW = 0;
  for (const it of items) {
    const cap = systems.length === 0 ? firstCapacity : capacity;
    if (line.length && lineW + it.natural > cap) {
      systems.push(closeSystem(line, lineW, cap, false));
      line = [];
      lineW = 0;
    }
    line.push(it);
    lineW += it.natural;
  }
  if (line.length) systems.push(closeSystem(line, lineW, systems.length === 0 ? firstCapacity : capacity, true));
  return systems;
}
