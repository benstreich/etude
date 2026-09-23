// Engraving for the Home staff: where every head, stem, beam and dot lands.
// The notation font only draws stems up, which is wrong for half the staff and
// cannot beam at all, so the notes are drawn rather than typed — this works out
// the geometry and components/motifs.tsx puts it on screen. Everything is in
// multiples of the staff space S, the way engravers size a score, with y = 0 on
// the top staff line. Pure and node-runnable — see scripts/check-engrave.ts.

import { eighthsFor, eighthsOf, meterFor, valueFor, type Head } from './melody.ts';

/** Staff positions are half-spaces; index 4 (B4) sits on the middle line. */
export const yOf = (pitch: number, S: number) => 2 * S - (pitch - 4) * (S / 2);

// Engraving proportions, all against the staff space. Stem and beam thickness
// and the head half-widths below are Bravura's own engravingDefaults and
// glyphBBoxes (redist/Bravura.json) converted to this unit — not guesses —
// so the note glyphs (see GLYPH below) and the drawn stems/beams agree on
// what size a space is.
export const LINE_W = (S: number) => 0.13 * S;
export const STEM_W = (S: number) => 0.12 * S;
export const BEAM_T = (S: number) => 0.5 * S;
const STEM_LEN = (S: number) => 3.5 * S;
/** Head half-width, from Bravura's noteheadBlack/Half/Whole/DoubleWhole bBoxes. */
export const headRx = (head: Head, S: number) => (head === 'whole' ? 0.844 : head === 'breve' ? 1.198 : 0.59) * S;
export const HEAD_RY = (S: number) => 0.5 * S;

// More Bravura measurements, all from redist/Bravura.json. A note is wider than
// its head: a flag hangs off the stem and a dot sits after the head, and neither
// used to be counted when spacing notes — which is how a flagged eighth came to
// stab into the head after it and a dot to end up under its neighbour.
/** The augmentation dot's radius — Bravura's augmentationDot is 0.4 wide. */
export const DOT_R = (S: number) => 0.2 * S;
/** Head edge to the dot's centre. */
const DOT_OUT = 0.5;
/** How far past the head's centre a dot reaches. */
const DOT_REACH = DOT_OUT + 0.2;
/** flag8thUp / flag8thDown bBox widths — what a flag adds past the stem it hangs on. */
const FLAG_UP_W = 1.056;
const FLAG_DOWN_W = 1.224;
/** gClef draws from its origin out to 2.684. */
const CLEF_W = 2.684;
/** Bravura's time-signature digit advances, timeSig0 … timeSig9. */
const DIGIT_W = [1.88, 1.336, 1.784, 1.684, 1.88, 1.612, 1.736, 1.764, 1.744, 1.736];

// --- Bravura (SMuFL) glyphs ---------------------------------------------
// Codepoints from the SMuFL spec; metrics below from redist/Bravura.json —
// glyphBBoxes and glyphsWithAnchors, in staff spaces, y-up from each glyph's
// own origin. Screen space is y-down, so every non-zero glyph-space y here
// gets negated when it's placed.
export const GLYPH = {
  gClef: '\u{E050}',
  noteheadBlack: '\u{E0A4}',
  noteheadHalf: '\u{E0A3}',
  noteheadWhole: '\u{E0A2}',
  noteheadDoubleWhole: '\u{E0A0}',
  flag8thUp: '\u{E240}',
  flag8thDown: '\u{E241}',
  restWhole: '\u{E4E3}',
  restEighth: '\u{E4E6}',
  // the rests an imported score can hold (#92); restEighth above is rest8th
  restDoubleWhole: '\u{E4E2}',
  restHalf: '\u{E4E4}',
  restQuarter: '\u{E4E5}',
  fermataAbove: '\u{E4C0}',
  accidentalSharp: '\u{E262}',
  accidentalFlat: '\u{E260}',
  accidentalNatural: '\u{E261}',
  /** The metronome-mark quarter note — sized for inline text, not for a staff. */
  metNoteQuarterUp: '\u{ECA5}',
  /** A whole number as a run of Bravura digit glyphs — a day can run past 9 beats. */
  timeSig: (n: number) =>
    [...String(Math.max(0, Math.round(n)))].map((d) => String.fromCodePoint(0xe080 + Number(d))).join(''),
};

const HEAD_GLYPH: Record<Head, string> = {
  eighth: GLYPH.noteheadBlack,
  quarter: GLYPH.noteheadBlack,
  half: GLYPH.noteheadHalf,
  whole: GLYPH.noteheadWhole,
  breve: GLYPH.noteheadDoubleWhole,
};
/** Which Bravura glyph draws a given note value's head. */
export const headGlyph = (head: Head) => HEAD_GLYPH[head];

const REST_GLYPH: Record<Head, string> = {
  eighth: GLYPH.restEighth,
  quarter: GLYPH.restQuarter,
  half: GLYPH.restHalf,
  whole: GLYPH.restWhole,
  breve: GLYPH.restDoubleWhole,
};
/** Which Bravura glyph draws a rest of a given value (#92). */
export const restGlyph = (head: Head) => REST_GLYPH[head];
/**
 * Where a rest glyph's origin sits, in staff spaces from the top line: the whole
 * rest hangs from the second line, everything else is drawn about the middle
 * line — Bravura's rest glyphs are designed around those origins.
 */
export const restY = (head: Head, S: number) => (head === 'whole' ? S : 2 * S);
/** Half of the widest rest glyph (restWhole/restHalf are 1.128 wide), so a rest is spaced like a head of that reach; a placed rest's `x` is its centre, the glyph's origin sits this far left of it. */
export const REST_HW = 0.56;

export type Accidental = 'sharp' | 'flat' | 'natural';
const ACC_GLYPH: Record<Accidental, string> = { sharp: GLYPH.accidentalSharp, flat: GLYPH.accidentalFlat, natural: GLYPH.accidentalNatural };
/** Bravura's glyphAdvanceWidths for accidentalSharp / accidentalFlat / accidentalNatural. */
const ACC_W: Record<Accidental, number> = { sharp: 0.996, flat: 0.904, natural: 0.92 };
/** Air between an accidental and the head it belongs to. */
const ACC_GAP = 0.2;
/** Bravura's engravingDefaults.legerLineExtension: how far a ledger line reaches past the head on each side. */
export const LEDGER_EXT = 0.4;

/**
 * The ledger lines a staff position needs, as y values (#92): below the staff at
 * the even positions -2, -4, … down to the note, above it at 10, 12, … up to the
 * note. E4…F5 (0..8) need none. The staff itself is `yOf` at 0, 2, 4, 6, 8.
 */
export function ledgerLines(pitch: number, S: number): number[] {
  const out: number[] = [];
  if (pitch <= -2) for (let p = -2; p >= pitch; p -= 2) out.push(yOf(p, S));
  else if (pitch >= 10) for (let p = 10; p <= pitch; p += 2) out.push(yOf(p, S));
  return out;
}

/**
 * Font size at which 1 Bravura metric unit (1 staff space) renders as `S`
 * pixels — the SMuFL convention is an em of 4 staff spaces.
 */
export const glyphFontSize = (S: number) => 4 * S;

/**
 * A notehead glyph's own origin (its baseline, left edge) for a head whose
 * centre sits at `(cx, cy)` — noteheadBlack/Half/Whole/DoubleWhole are all
 * designed with the origin at the vertical centre and the left sidebearing,
 * so no vertical offset is needed, only the shift from centre to edge.
 */
export const headOrigin = (head: Head, cx: number, cy: number, S: number) => ({ x: cx - headRx(head, S), y: cy });

/** A flag glyph's own origin so its stem-attachment anchor lands at the stem's end. */
export function flagOrigin(down: boolean, stemEndX: number, stemEndY: number, S: number) {
  return down ? { x: stemEndX, y: stemEndY + 0.132 * S } : { x: stemEndX, y: stemEndY - 0.04 * S };
}

/**
 * A note earns room by its length — the long ones breathe, as engraved music
 * does. Engravers grow the space by roughly the root of the duration rather than
 * in step with it, so a whole note reads as longer than an eighth without taking
 * eight times the room. The old three-step version gave a dotted quarter exactly
 * the room of a plain eighth, which is what made the dotted values look cramped.
 */
const advance = (f: number, S: number) => (1.75 + 1.9 * Math.sqrt(f)) * S;
/** Space between the barline (or the meter column) and the first head's left edge. */
const LEAD = (S: number) => 1.2 * S;
/** The least air between what one note draws and what the next one draws. */
const NOTE_GAP = (S: number) => 0.8 * S;
/** Room after the last note, so a flag or a dot never crosses the barline. */
const TRAIL = (S: number) => 1.2 * S;

/** What spacing needs to know about one note beyond its value. */
type Shape = { head: Head; rest: boolean; acc: Accidental | undefined; ledger: boolean };

/**
 * How far left of its centre a note reaches — a down-stem rides the head's left
 * edge; an accidental stands before the head, and a ledger line overhangs it.
 */
function leftExtent(sh: Shape, S: number): number {
  if (sh.rest) return REST_HW * S;
  let reach = headRx(sh.head, S);
  if (sh.ledger) reach += LEDGER_EXT * S;
  if (sh.acc) reach += (ACC_GAP + ACC_W[sh.acc]) * S;
  return reach;
}

/**
 * How far right of its centre a note reaches: its head, plus any flag hung off
 * the stem and any augmentation dot. Both overhang the head, so both have to be
 * known before the next note can be given a place.
 */
function rightExtent(sh: Shape, dotted: boolean, flag: boolean, down: boolean, S: number): number {
  const r = sh.rest ? REST_HW * S : headRx(sh.head, S);
  let reach = sh.ledger ? r + LEDGER_EXT * S : r;
  // an up-stem carries its flag off the head's right edge; a down-stem's hangs
  // from the left edge, so it reaches back across the head rather than past it
  if (flag) reach = Math.max(reach, down ? FLAG_DOWN_W * S - r : r + FLAG_UP_W * S);
  if (dotted) reach = Math.max(reach, r + DOT_REACH * S);
  return reach;
}

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
  /** a rest (#92): `y` is then the rest glyph's origin and `head` says which rest; no stem, flag or beam */
  rest: boolean;
  /** the accidental before the head, at its own glyph origin */
  acc: { x: number; y: number; glyph: string } | null;
  /** y of each ledger line this note needs */
  ledger: number[];
};
export type Beam = { x1: number; y1: number; x2: number; y2: number; down: boolean };
export type BarLayout = { width: number; notes: Placed[]; beams: Beam[] };

/** The highest point a note actually reaches — its head, or its stem's tip if it has one. */
export function noteTop(n: Placed, S: number): number {
  const headTop = n.y - HEAD_RY(S);
  return n.stem ? Math.min(headTop, n.stem.y1, n.stem.y2) : headTop;
}

/** `rest` and `acc` arrive with imported scores (#92); the practice log never sets them. */
export type Note = { id: string; min: number; pitch: number; rest?: boolean; acc?: Accidental };

/**
 * Lay a bar out. Stems point down on or above the middle line and up below it,
 * the ordinary rule; a run of adjacent eighths is beamed instead of flagged, and
 * the whole run takes one direction so the beam has somewhere to sit.
 * `beamEvery`, in eighths, closes a beam at every beat of that length so an
 * imported 4/4 bar beams by the quarter and a 6/8 bar by the dotted quarter;
 * the practice log leaves it open and beams every adjacent run. `targetWidth`
 * (#92) justifies the bar into a wider column: the slack is spread over the
 * gaps between the notes (and after the last) in proportion to their natural
 * size, the way a justified system spreads its slack over its bars — the lead
 * after the barline stays where it is. Narrower than natural is ignored.
 */
export function layoutBar(notes: Note[], goal: number, S: number, beamEvery = Infinity, targetWidth?: number): BarLayout {
  const stemLen = STEM_LEN(S);
  const stemW = STEM_W(S);

  // Beaming and stem direction settle first, before any note is given a place:
  // how wide a note draws depends on whether it kept its flag and which way the
  // stem points, so the spacing below cannot be worked out until both are known.
  let at = 0; // position in eighths, for the beat grouping
  const placed = notes.map((n) => {
    const v = valueFor(n.min, goal);
    const rest = !!n.rest;
    const p = {
      n,
      v,
      x: 0,
      y: rest ? restY(v.head, S) : yOf(n.pitch, S),
      down: n.pitch >= 4,
      flag: false,
      at,
      sh: { head: v.head, rest, acc: rest ? undefined : n.acc, ledger: !rest && ledgerLines(n.pitch, S).length > 0 } as Shape,
    };
    at += eighthsOf(v);
    return p;
  });

  // runs of two or more adjacent eighths beam together; a rest or a beat boundary ends a run
  const runs: (typeof placed)[] = [];
  let run: typeof placed = [];
  const close = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (const p of placed) {
    if (Number.isFinite(beamEvery) && beamEvery > 0 && run.length && Math.floor(p.at / beamEvery) !== Math.floor(run[0].at / beamEvery)) close();
    if (p.v.head === 'eighth' && !p.v.dotted && !p.sh.rest) run.push(p);
    else close();
  }
  close();
  const beamed = new Set(runs.flat());
  // a run takes the direction most of its notes wanted, so one beam serves them all
  for (const r of runs) {
    const down = r.filter((p) => p.down).length * 2 >= r.length;
    for (const p of r) p.down = down;
  }
  for (const p of placed) p.flag = p.v.head === 'eighth' && !p.sh.rest && !beamed.has(p);

  // Now the widths are knowable. A note takes the room its value earns, or the
  // room it and its neighbour physically need — whichever is greater.
  let x = placed[0] ? LEAD(S) + leftExtent(placed[0].sh, S) : LEAD(S);
  placed.forEach((p, i) => {
    p.x = x;
    const next = placed[i + 1];
    if (!next) return;
    const need = rightExtent(p.sh, p.v.dotted, p.flag, p.down, S) + NOTE_GAP(S) + leftExtent(next.sh, S);
    x += Math.max(advance(p.v.f, S), need);
  });
  // The last note earns its length's room too, against the barline rather than a
  // neighbour — otherwise a day of one long session drew exactly as wide as a day
  // of one short one, and the bar stopped saying anything about how long it was.
  const lastP = placed[placed.length - 1];
  let width = lastP
    ? lastP.x + Math.max(advance(lastP.v.f, S), rightExtent(lastP.sh, lastP.v.dotted, lastP.flag, lastP.down, S) + TRAIL(S))
    : LEAD(S) + TRAIL(S);
  if (targetWidth !== undefined && targetWidth > width && placed.length) {
    // gaps after each note: between neighbours, and from the last note to the barline
    const gaps = placed.map((p, i) => (i + 1 < placed.length ? placed[i + 1].x - p.x : width - p.x));
    const total = gaps.reduce((a, g) => a + g, 0);
    const slack = targetWidth - width;
    let shift = 0;
    placed.forEach((p, i) => {
      p.x += shift;
      shift += total > 0 ? (slack * gaps[i]) / total : 0;
    });
    width = targetWidth;
  }

  const beams: Beam[] = [];
  for (const r of runs) {
    const down = r[0].down;
    const end = (p: (typeof r)[number]) => (down ? p.y + stemLen : p.y - stemLen);
    const y1 = end(r[0]);
    // engravers cap the slope: a beam that chases every leap is unreadable
    const y2 = y1 + Math.max(-S, Math.min(S, end(r[r.length - 1]) - y1));
    beams.push({ x1: stemX(r[0], down, S, stemW), y1, x2: stemX(r[r.length - 1], down, S, stemW) + stemW, y2, down });
  }
  const beamY = (p: (typeof placed)[number]) => {
    const b = beams[runs.findIndex((r) => r.includes(p))];
    const r = runs.find((x2) => x2.includes(p))!;
    const i = r.indexOf(p);
    return r.length === 1 ? b.y1 : b.y1 + ((b.y2 - b.y1) * i) / (r.length - 1);
  };

  const out: Placed[] = placed.map((p) => {
    if (p.sh.rest) {
      // a rest's dot sits in the space above the middle line, whatever the rest
      const dot = p.v.dotted ? { x: p.x + REST_HW * S + DOT_OUT * S, y: 1.5 * S } : null;
      return { id: p.n.id, x: p.x, y: p.y, head: p.v.head, stem: null, flag: false, down: false, dot, rest: true, acc: null, ledger: [] };
    }
    const open = p.v.head === 'whole' || p.v.head === 'breve';
    const stem = open
      ? null
      : { x: stemX(p, p.down, S, stemW), y1: p.y, y2: beamed.has(p) ? beamY(p) : p.down ? p.y + stemLen : p.y - stemLen };
    // a dot never sits on a staff line — on a line it rides into the space above
    const dot = p.v.dotted ? { x: p.x + headRx(p.v.head, S) + DOT_OUT * S, y: p.y - (p.n.pitch % 2 === 0 ? S / 2 : 0) } : null;
    const acc = p.sh.acc ? { x: p.x - headRx(p.v.head, S) - (ACC_GAP + ACC_W[p.sh.acc]) * S, y: p.y, glyph: ACC_GLYPH[p.sh.acc] } : null;
    return { id: p.n.id, x: p.x, y: p.y, head: p.v.head, stem, flag: p.flag, down: p.down, dot, rest: false, acc, ledger: ledgerLines(p.n.pitch, S) };
  });

  return { width, notes: out, beams };
}

/** A stem rides the right edge of its head going up, the left edge going down. */
function stemX(p: { x: number; v: { head: Head } }, down: boolean, S: number, stemW: number) {
  const r = headRx(p.v.head, S) - 0.03 * S;
  return down ? p.x - r : p.x + r - stemW;
}

// --- the clef and key signature, the part that never scrolls ---------------

/** Staff position of each sharp in a treble key signature, in the order they are added. */
const SHARP_AT: Record<string, number> = { F: 8, C: 5, G: 10, D: 6, A: 3, E: 7, B: 4 };
const FLAT_AT: Record<string, number> = { B: 4, E: 7, A: 3, D: 6, G: 2, C: 5, F: 1 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Where the clef's own origin sits. Both staves place it here, so this is the one truth. */
export const CLEF_X = (S: number) => 0.5 * S;
/** The air the clef keeps around itself. */
const CLEF_SEP = 0.6;
/**
 * The first accidental starts clear of the clef's actual right edge. gClef draws
 * out to 2.684 from its origin at 0.5, so anything before 3.284 sits *inside* the
 * clef — which is why the signature used to be printed on top of it.
 */
const SIG_X0 = 0.5 + CLEF_W + CLEF_SEP;
// Bravura's accidentalSharp/Flat are close to a full staff space wide
// (glyphAdvanceWidths: 0.996 / 0.904) — this step has to clear that, or
// consecutive accidentals overlap. Set just above the sharp's advance width,
// the way a signature is engraved: six sharps cost real staff width on Home.
const SIG_STEP = 1.05;
/** The widest accidental, so the block's right edge clears the last one drawn. */
const SIG_W = 1.0;

/** Where each accidental of the signature goes; `sig` is sharps (+) or flats (−). */
export function signatureMarks(sig: number, S: number): { x: number; y: number; sharp: boolean }[] {
  return signatureMarksAt(sig, SIG_X0 * S, S);
}

/** The same signature starting at an arbitrary `x0` — a key change written mid-system (#92). */
export function signatureMarksAt(sig: number, x0: number, S: number): { x: number; y: number; sharp: boolean }[] {
  const letters = sig > 0 ? SHARP_ORDER.slice(0, sig) : FLAT_ORDER.slice(0, -sig);
  return letters.map((l, i) => ({
    x: x0 + i * SIG_STEP * S,
    y: yOf(sig > 0 ? SHARP_AT[l] : FLAT_AT[l], S),
    sharp: sig > 0,
  }));
}

/** Width of a key-change column inside a bar: the accidentals and their air; nothing for C major (no cancellation naturals in v1). */
export const KEY_COL_W = (sig: number, S: number) => {
  const n = Math.abs(sig);
  return n === 0 ? 0 : ((n - 1) * SIG_STEP + SIG_W + 2 * SIG_SEP_END) * S;
};

/** The air after the last accidental — less than the clef's, the notes can sit close. */
const SIG_SEP_END = 0.3;

/** Width of the clef-and-signature block, which is pinned to the left of the staff. */
export const headerW = (sig: number, S: number) => {
  const n = Math.abs(sig);
  // with no signature the block is just the clef and its air
  return n === 0 ? SIG_X0 * S : (SIG_X0 + (n - 1) * SIG_STEP + SIG_W + SIG_SEP_END) * S;
};

// --- the full score: bars wrapped into systems down the page ---------------

/** A bar's fixed column overhead — a barline and its breathing room. */
export const BAR_PAD = (S: number) => 0.4 * S;
/**
 * The time-signature column, only present where the meter is written. Sized to
 * the digits actually set: Bravura's numerals run 1.336 (a 1) to 1.88 (a 0 or 4)
 * spaces each, and a day past nine beats sets two of them — so a fixed column
 * either crowded the note after it or clipped the meter itself.
 */
export const METER_COL_W = (beats: number, S: number, denom = 4) => {
  const width = (n: number) => [...String(Math.max(0, Math.round(n)))].reduce((w, d) => w + DIGIT_W[Number(d)], 0);
  // the practice log's denominator is always a 4; an imported score's can be anything (#92) — fit the wider of the two
  return (Math.max(width(beats), width(denom)) + 1.5) * S;
};
// A rest is a glyph like any other and needs air on both sides of it. These
// columns used to end barely a fifth of a space after the rest's own right edge,
// which put every rest hard up against the next barline.
/** A day off — one rest column. restWhole is 1.128 wide, drawn at 0.9. */
export const REST_COL_W = (S: number) => 2.9 * S;
/** The eighth rest that squares a bar with the meter it claims. rest8th is 0.988 wide. */
export const PAD_COL_W = (S: number) => 2.5 * S;
/** Where a rest's own glyph starts inside its column. */
export const REST_X = (S: number) => 0.9 * S;
/** Where the squaring-up eighth rest starts, measured from the end of the notes. */
export const PAD_REST_X = (S: number) => 0.5 * S;

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
    const natural =
      BAR_PAD(S) + (meter !== null ? METER_COL_W(meter, S) : 0) + (lay ? lay.width : REST_COL_W(S)) + (pad ? PAD_COL_W(S) : 0);
    return { date: b.date, meter, lay, pad, natural };
  });

  type Item = (typeof items)[number];
  const closeSystem = (line: Item[], cap: number, isLast: boolean): System => {
    const j = justifyLine(line, cap, isLast);
    return { bars: j.items.map(({ natural: _n, ...bar }) => bar), width: j.width };
  };

  const systems: System[] = [];
  let line: Item[] = [];
  let lineW = 0;
  for (const it of items) {
    const cap = systems.length === 0 ? firstCapacity : capacity;
    if (line.length && lineW + it.natural > cap) {
      systems.push(closeSystem(line, cap, false));
      line = [];
      lineW = 0;
    }
    line.push(it);
    lineW += it.natural;
  }
  if (line.length) systems.push(closeSystem(line, systems.length === 0 ? firstCapacity : capacity, true));
  return systems;
}

/**
 * Spread one system's slack across its bars in proportion to their natural
 * width, and place them left to right. The last system stays ragged unless it
 * is already mostly full — the printed convention. Shared by the practice
 * log's score and an imported one (#92), so both justify the same way.
 */
export function justifyLine<T extends { natural: number }>(line: T[], cap: number, isLast: boolean): { items: (T & { x: number; width: number })[]; width: number } {
  const naturalTotal = line.reduce((a, it) => a + it.natural, 0);
  const justify = !isLast || (cap > 0 && naturalTotal / cap > 0.6);
  const slack = justify ? Math.max(0, cap - naturalTotal) : 0;
  let x = 0;
  const items = line.map((it) => {
    const width = it.natural + (naturalTotal > 0 ? (it.natural / naturalTotal) * slack : 0);
    const out = { ...it, x, width };
    x += width;
    return out;
  });
  return { items, width: justify ? cap : naturalTotal };
}
