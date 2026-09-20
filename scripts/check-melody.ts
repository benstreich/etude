// The practice log as a melody: a pentatonic pitch per focus, a value per session, one bar per day, read in a key.
import assert from 'node:assert';

import { barsFor, DEGREES, degreeFor, eighthsFor, eighthsOf, KEYS, meterFor, midiFor, NOTE_VALUES, pentatonicPitches, PITCHES, pitchFor, valueFor, type MelodyKey, type SessionNote } from '../src/lib/melody.ts';

// --- pitch ----------------------------------------------------------------
assert.equal(pitchFor('Bach Invention', 'C'), pitchFor('Bach Invention', 'C')); // a piece always sings the same note
for (const n of ['Bach Invention', 'Scales', '']) assert.ok(pitchFor(n, 'C') >= 0 && pitchFor(n, 'C') < PITCHES.length);
assert.ok(new Set(['Scales', 'Arpeggios', 'Bach Invention', 'Chopin Waltz', 'Sight reading', 'Etude'].map((n) => pitchFor(n, 'C'))).size > 1); // a repertoire is not one pitch

// --- pentatonic -----------------------------------------------------------
// every key gives exactly six degrees, which is what lets a degree transpose
for (const key of KEYS) {
  const ps = pentatonicPitches(key);
  assert.equal(ps.length, DEGREES, `${key} has ${ps.length} pentatonic positions`);
  assert.deepEqual(ps, [...ps].sort((a, b) => a - b), `${key} pentatonic is not ascending`);
  assert.equal(new Set(ps).size, DEGREES, `${key} repeats a staff position`);
}
assert.deepEqual(pentatonicPitches('C'), [0, 2, 3, 5, 6, 7]); // E G A C D E — C major pentatonic, no F and no B
assert.deepEqual(pentatonicPitches('G'), [0, 2, 3, 4, 6, 7]); // E G A B D E — G major pentatonic, no F# and no C
// the fourth and seventh are the notes a major pentatonic leaves out, in every key
const DEGREE_STEPS: Record<MelodyKey, number> = { C: 0, G: 7, D: 2, A: 9, E: 4, B: 11, 'F#': 6, Db: 1, Ab: 8, Eb: 3, Bb: 10, F: 5 };
for (const key of KEYS) {
  const tonic = DEGREE_STEPS[key];
  const intervals = new Set(pentatonicPitches(key).map((p) => (((midiFor(p, key) - tonic) % 12) + 12) % 12));
  for (const i of intervals) assert.ok([0, 2, 4, 7, 9].includes(i), `${key} sounds a non-pentatonic interval ${i}`);
}
// a degree is the same step of the scale in every key — that is what "transposed" means
for (const name of ['Scales', 'Bach Invention', 'Czerny']) {
  const d = degreeFor(name);
  for (const key of KEYS) assert.equal(pitchFor(name, key), pentatonicPitches(key)[d], `${name} in ${key} is off its degree`);
}

// --- key signatures -------------------------------------------------------
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => midiFor(p, 'C')), [64, 65, 67, 69, 71, 72, 74, 76, 77]); // E4..F5 natural
assert.equal(midiFor(1, 'G'), 66); // G major sharpens F → F#4
assert.equal(midiFor(8, 'G'), 78); // and F5
assert.equal(midiFor(0, 'G'), 64); // E untouched
assert.equal(midiFor(5, 'D'), 73); // D major: F# and C# → C#5
assert.equal(midiFor(4, 'F'), 70); // F major flattens B → Bb4
assert.equal(midiFor(0, 'Eb'), 63); // Eb major: Bb Eb Ab → Eb4
assert.equal(midiFor(4, 'F#'), 71); // F# major has six sharps (F C G D A E); B stays natural
for (const key of KEYS) for (let p = 0; p < PITCHES.length; p++) assert.ok(Math.abs(midiFor(p, key) - midiFor(p, 'C')) <= 1); // a signature moves a note by at most a semitone

// --- value ----------------------------------------------------------------
assert.deepEqual(valueFor(20, 60), { f: 3 / 8, glyph: '\u{1D15F}', head: 'quarter', dotted: true }); // a third → dotted quarter
assert.equal(valueFor(60, 60).glyph, '\u{1D15D}'); // goal met → whole
assert.equal(valueFor(90, 60).glyph, '\u{1D15D}'); // half again as long → dotted whole
assert.equal(valueFor(90, 60).dotted, true);
assert.equal(valueFor(120, 60).glyph, '\u{1D15C}'); // twice the goal in one sitting → breve
assert.equal(valueFor(600, 60).glyph, '\u{1D15C}'); // and there the scale saturates
assert.equal(valueFor(1, 60).glyph, '\u{1D160}'); // barely anything → eighth
assert.equal(valueFor(30, 60).glyph, '\u{1D15E}'); // half
assert.equal(valueFor(45, 60).dotted, true); // dotted half

// --- meter ----------------------------------------------------------------
// every value in the table is a whole number of eighths, which is the only
// reason a bar's length can be written as a time signature at all
for (const v of NOTE_VALUES) assert.equal(eighthsOf(v), v.f * 8, `${v.f} is not a whole number of eighths`);
assert.equal(meterFor(0), null); // a day off rests the whole bar and inherits the meter
assert.deepEqual(meterFor(8), { beats: 4, padEighths: 0 }); // the goal met → 4/4
assert.deepEqual(meterFor(12), { beats: 6, padEighths: 0 }); // half again as long → 6/4
assert.deepEqual(meterFor(11), { beats: 6, padEighths: 1 }); // lands between beats → 6/4 and an eighth rest
assert.deepEqual(meterFor(1), { beats: 1, padEighths: 1 }); // the shortest day there is
// the promise the signature makes: the written notes plus the pad always fill the bar
for (let e = 1; e <= 40; e++) {
  const m = meterFor(e)!;
  assert.equal(e + m.padEighths, m.beats * 2, `${e} eighths does not fill ${m.beats}/4`);
  assert.ok(m.padEighths === 0 || m.padEighths === 1, `${e} eighths pads by ${m.padEighths}`);
}
// a day of five sessions against a 65 min goal: 11 eighths, so 6/4 with a rest
const busyDay = [{ min: 5 }, { min: 18 }, { min: 10 }, { min: 7 }, { min: 47 }];
assert.equal(eighthsFor(busyDay, 65), 11);
assert.deepEqual(meterFor(eighthsFor(busyDay, 65)), { beats: 6, padEighths: 1 });
// the goal met in one sitting is the plain 4/4 bar the others are read against
assert.deepEqual(meterFor(eighthsFor([{ min: 65 }], 65)), { beats: 4, padEighths: 0 });

// --- bars -----------------------------------------------------------------
const S = (id: string, title: string, min: number, date: string, at: number): SessionNote => ({ id, title, min, date, at });
const week = ['2026-09-14', '2026-09-15', '2026-09-16'];
const bars = barsFor(week, { '2026-09-14': 5, '2026-09-16': 45 }, [S('a', 'Scales', 5, '2026-09-14', 9), S('b', 'Bach', 30, '2026-09-16', 8), S('c', 'Scales', 15, '2026-09-16', 20)], 'C');
assert.equal(bars.length, 3);
assert.deepEqual(bars[1].notes, []); // a day off is an empty bar
assert.equal(bars[2].notes.length, 2); // two sessions, two notes
assert.deepEqual(bars[2].notes.map((n) => n.min), [30, 15]); // chronological: the morning first
assert.equal(bars[2].notes[0].pitch, pitchFor('Bach', 'C'));
assert.equal(bars[2].notes[1].pitch, pitchFor('Scales', 'C'));
assert.equal(new Set(bars.flatMap((b) => b.notes.map((n) => n.id))).size, 3); // ids are unique — the staff keys on them
// the same focus twice in a day is the same note twice, not one merged one
const twice = barsFor(['2026-09-16'], { '2026-09-16': 40 }, [S('a', 'Scales', 20, '2026-09-16', 1), S('b', 'Scales', 20, '2026-09-16', 2)], 'C');
assert.equal(twice[0].notes.length, 2);
assert.equal(twice[0].notes[0].pitch, twice[0].notes[1].pitch);
// a day whose minutes have no sessions behind them (old data, or deleted ones) still gets its note
const legacy = barsFor(['2026-09-16'], { '2026-09-16': 45 }, [], 'C');
assert.equal(legacy[0].notes.length, 1);
assert.equal(legacy[0].notes[0].min, 45);
assert.equal(legacy[0].notes[0].pitch, pitchFor('2026-09-16', 'C'));
// a busy day stays readable: at most six notes, and none of the minutes lost
const busy = barsFor(['2026-09-16'], { '2026-09-16': 80 }, Array.from({ length: 9 }, (_, i) => S(`s${i}`, `F${i}`, 10 + i, '2026-09-16', i)), 'C');
assert.equal(busy[0].notes.length, 6);
assert.equal(busy[0].notes.reduce((a, n) => a + n.min, 0), Array.from({ length: 9 }, (_, i) => 10 + i).reduce((a, b) => a + b));
assert.equal(busy[0].notes[5].pitch, pitchFor('F8', 'C')); // the tail speaks for its longest focus
// a zero-minute session is no note at all
assert.deepEqual(barsFor(['2026-09-16'], { '2026-09-16': 0 }, [S('a', 'Scales', 0, '2026-09-16', 1)], 'C')[0].notes, []);

// --- alterations ----------------------------------------------------------
// alterationFor is what midiFor and accidentalFor both read: a signature
// raises, lowers or leaves a note, never anything else.
import { alterationFor } from '../src/lib/melody.ts';
assert.equal(alterationFor(1, 'G'), 1); // F is sharpened in G major
assert.equal(alterationFor(4, 'F'), -1); // B is flattened in F major
for (let p = 0; p < PITCHES.length; p++) assert.equal(alterationFor(p, 'C'), 0, 'C major alters nothing');
for (const key of KEYS)
  for (let p = 0; p < PITCHES.length; p++) {
    const a = alterationFor(p, key);
    assert.ok(a === -1 || a === 0 || a === 1, `${key}/${p} alteration ${a}`);
    assert.equal(midiFor(p, key) - midiFor(p, 'C'), a, 'midiFor is the natural plus the alteration');
  }
// a key signature is all sharps or all flats, never a mix
for (const key of KEYS) {
  const alts = new Set([...Array(PITCHES.length).keys()].map((p) => alterationFor(p, key)).filter(Boolean));
  assert.ok(alts.size <= 1, `${key} mixes sharps and flats`);
}

console.log('check-melody ok');
