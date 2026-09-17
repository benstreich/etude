// The practice log as a melody. Every day is a bar with one note: its pitch is
// the day's own (hashed from the date, so a given day always sounds the same)
// and its value is the day's minutes over the daily goal. Pure and node-runnable
// — see scripts/check-melody.ts.

/** Staff positions, bottom line up: E4 F4 G4 A4 B4 C5 D5 E5 F5 — no ledger lines. */
export const PITCHES = ['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F'] as const;
/** MIDI of each staff position with no key signature (C major). */
const NATURAL_MIDI = [64, 65, 67, 69, 71, 72, 74, 76, 77];

/** The twelve major keys, around the circle of fifths from C; the setting stores the tonic. */
export const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
export type MelodyKey = (typeof KEYS)[number];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']; // the order sharps are added
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
// key → number of sharps (positive) or flats (negative)
const SIGNATURE: Record<MelodyKey, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1 };

/** -1, 0 or +1: how the key signature bends a staff position. */
export function alterationFor(pitch: number, key: MelodyKey): -1 | 0 | 1 {
  const letter = PITCHES[pitch];
  const sig = SIGNATURE[key] ?? 0;
  const altered = sig > 0 ? SHARP_ORDER.slice(0, sig).includes(letter) : FLAT_ORDER.slice(0, -sig).includes(letter);
  return altered ? (Math.sign(sig) as -1 | 1) : 0;
}

/** MIDI note of a staff position read in `key`: the natural, raised or lowered by the key signature. */
export function midiFor(pitch: number, key: MelodyKey): number {
  return NATURAL_MIDI[pitch] + alterationFor(pitch, key);
}

/** The accidental to write before a note in `key` — the staff scrolls, so a signature at the far left would rarely be in view. */
export const accidentalFor = (pitch: number, key: MelodyKey) => ({ [-1]: '\u{266D}', 0: '', 1: '\u{266F}' })[alterationFor(pitch, key)];

/** A stable pseudo-random staff index 0..8 for any key (a dateKey here). */
export function pitchFor(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return Math.abs(h) % PITCHES.length;
}

// note values by fraction of the goal; the glyphs are Unicode Musical Symbols
const VALUES: { f: number; glyph: string; dotted: boolean }[] = [
  { f: 1 / 8, glyph: '\u{1D160}', dotted: false },
  { f: 1 / 4, glyph: '\u{1D15F}', dotted: false },
  { f: 3 / 8, glyph: '\u{1D15F}', dotted: true },
  { f: 1 / 2, glyph: '\u{1D15E}', dotted: false },
  { f: 3 / 4, glyph: '\u{1D15E}', dotted: true },
  { f: 1, glyph: '\u{1D15D}', dotted: false },
];

/** Nearest note value to `min / goal`; anything past the goal is a whole note. */
export function valueFor(min: number, goal: number) {
  const f = Math.min(1, min / Math.max(1, goal));
  return VALUES.reduce((best, v) => (Math.abs(v.f - f) < Math.abs(best.f - f) ? v : best), VALUES[0]);
}

export type MelodyNote = { title: string; min: number; pitch: number };
export type Bar = { date: string; notes: MelodyNote[] };

/** One bar per date (oldest first): a single note for the day's minutes, or none for a day off. */
export function barsFor(dates: string[], minutesByDate: Record<string, number>): Bar[] {
  return dates.map((date) => {
    const min = minutesByDate[date] ?? 0;
    return { date, notes: min > 0 ? [{ title: date, min, pitch: pitchFor(date) }] : [] };
  });
}
