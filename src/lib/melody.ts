// The practice log as a melody. Every day is a bar and every session in it a
// note: the pitch belongs to the focus practised (so a piece always sings the
// same note and your repertoire becomes a motif you recognise) and the value is
// that session's minutes over the daily goal — the bar fills as the day does.
// Pitches are drawn from the key's major pentatonic, which has no wrong notes,
// so any week of practice still sounds intentional. Pure and node-runnable
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
export const SIGNATURE: Record<MelodyKey, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1 };

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

/** The seven letter names, so a key's scale can be spelled by stepping through them. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
/** Degrees 1 2 3 5 6 of the major scale — the major pentatonic, spelled as letters. */
const pentatonicLetters = (key: MelodyKey) => [0, 1, 2, 4, 5].map((i) => LETTERS[(LETTERS.indexOf(key[0]) + i) % 7]);

/** How many notes a melody can use — the pentatonic degrees available in every key. */
export const DEGREES = 6;

/**
 * The six lowest staff positions belonging to the key's major pentatonic.
 * Exactly six, in every key: the two letters the pentatonic leaves out sit three
 * steps apart and so can never be both E and F, which are the two the staff
 * carries twice — so at least one duplicate always survives. That fixed count is
 * what lets a degree mean the same thing in every key (see DEGREES).
 */
export function pentatonicPitches(key: MelodyKey): number[] {
  const set = pentatonicLetters(key);
  return PITCHES.flatMap((letter, i) => (set.includes(letter) ? [i] : [])).slice(0, DEGREES);
}

/** A stable pseudo-random degree 0..5 for a name: the same focus always sings the same note. */
export function degreeFor(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return Math.abs(h) % DEGREES;
}

/** Staff position for a name read in `key` — its degree, placed on that key's pentatonic. */
export function pitchFor(name: string, key: MelodyKey): number {
  return pentatonicPitches(key)[degreeFor(name)];
}

/** Which head a value is drawn with; the open ones carry no stem. `glyph` is the same note as one character, for the legend. */
export type Head = 'eighth' | 'quarter' | 'half' | 'whole' | 'breve';

/**
 * Note values by fraction of the goal; the glyphs are Unicode Musical Symbols.
 * Shortest first — the legend reads them in this order. A bar holds a day, not a
 * fixed meter, so these need not sum to four beats: a day that beat the goal
 * simply writes a longer bar, which is what actually happened.
 */
export const NOTE_VALUES: { f: number; glyph: string; head: Head; dotted: boolean }[] = [
  { f: 1 / 8, glyph: '\u{1D160}', head: 'eighth', dotted: false },
  { f: 1 / 4, glyph: '\u{1D15F}', head: 'quarter', dotted: false },
  { f: 3 / 8, glyph: '\u{1D15F}', head: 'quarter', dotted: true },
  { f: 1 / 2, glyph: '\u{1D15E}', head: 'half', dotted: false },
  { f: 3 / 4, glyph: '\u{1D15E}', head: 'half', dotted: true },
  { f: 1, glyph: '\u{1D15D}', head: 'whole', dotted: false },
  { f: 3 / 2, glyph: '\u{1D15D}', head: 'whole', dotted: true },
  { f: 2, glyph: '\u{1D15C}', head: 'breve', dotted: false },
];

/** Twice the goal: the longest note the table can write, and where the scale gives up. */
export const MAX_VALUE = 2;

/**
 * Nearest note value to `min / goal`. The scale runs past the whole note to a
 * breve, so an afternoon that doubles the goal no longer reads as an hour; past
 * that it saturates, which is the one thing the staff cannot say.
 */
export function valueFor(min: number, goal: number) {
  const f = Math.min(MAX_VALUE, min / Math.max(1, goal));
  return NOTE_VALUES.reduce((best, v) => (Math.abs(v.f - f) < Math.abs(best.f - f) ? v : best), NOTE_VALUES[0]);
}

/** A value's length in eighths — every entry in the table is a whole number of them. */
export const eighthsOf = (v: { f: number }) => Math.round(v.f * 8);

/** How many eighths a bar's notes actually write. */
export function eighthsFor(notes: { min: number }[], goal: number): number {
  return notes.reduce((a, n) => a + eighthsOf(valueFor(n.min, goal)), 0);
}

/**
 * A bar's own time signature — the day's length, since the bar *is* the day.
 * Always over 4: this staff changes meter constantly, and a denominator that
 * moves as well as a numerator is unreadable at a glance. An eighth is half a
 * beat, so a day can land between beats; the bar is rounded up to the next whole
 * beat and `padEighths` is the gap, written as an eighth rest so the bar adds up
 * to exactly what its signature promises. Null for a day off, which rests the
 * whole bar and inherits the meter, as a full-bar rest does in any score.
 */
export function meterFor(eighths: number): { beats: number; padEighths: number } | null {
  if (eighths <= 0) return null;
  const beats = Math.ceil(eighths / 2);
  return { beats, padEighths: beats * 2 - eighths };
}

/** A note is one session: `title` is the focus it was spent on, and gives the pitch. */
export type MelodyNote = { id: string; title: string; min: number; pitch: number };
export type Bar = { date: string; notes: MelodyNote[] };
/** What a bar needs of a logged session (store.Session is one of these). */
export type SessionNote = { id: string; title: string; min: number; date: string; at?: number };

/** More notes than this in one bar is a smudge, not a rhythm; the tail merges into one. */
const MAX_NOTES = 6;

/**
 * One bar per date (oldest first), one note per session inside it, chronological
 * so the bar reads left to right the way the day went. A day off is an empty bar.
 */
export function barsFor(dates: string[], minutesByDate: Record<string, number>, sessions: SessionNote[], key: MelodyKey): Bar[] {
  const byDate: Record<string, SessionNote[]> = {};
  for (const x of sessions) if (x.min > 0) (byDate[x.date] ??= []).push(x);
  for (const day of Object.values(byDate)) day.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  return dates.map((date) => {
    const min = minutesByDate[date] ?? 0;
    if (min <= 0) return { date, notes: [] };
    const day = byDate[date] ?? [];
    // a day logged before sessions were kept — or one whose sessions were since
    // deleted — still gets its bar: one note for the total, pitched by the date
    if (!day.length) return { date, notes: [{ id: date, title: date, min, pitch: pitchFor(date, key) }] };

    const kept = day.length > MAX_NOTES ? day.slice(0, MAX_NOTES - 1) : day;
    const notes = kept.map((x) => ({ id: x.id, title: x.title, min: x.min, pitch: pitchFor(x.title, key) }));
    if (day.length > MAX_NOTES) {
      // the rest of the day as one note, speaking for the longest focus in it
      const rest = day.slice(MAX_NOTES - 1);
      const loudest = rest.reduce((a, b) => (b.min > a.min ? b : a));
      notes.push({ id: `${date}-rest`, title: loudest.title, min: rest.reduce((a, b) => a + b.min, 0), pitch: pitchFor(loudest.title, key) });
    }
    return { date, notes };
  });
}
