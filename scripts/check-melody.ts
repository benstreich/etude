// The practice log as a melody: a pitch per day, a value per minutes, one bar per day, read in a key.
import assert from 'node:assert';

import { accidentalFor, barsFor, KEYS, midiFor, PITCHES, pitchFor, valueFor } from '../src/lib/melody.ts';

// --- pitch ----------------------------------------------------------------
assert.equal(pitchFor('2026-09-16'), pitchFor('2026-09-16')); // stable
for (const k of ['2026-09-16', '2026-01-01', '']) assert.ok(pitchFor(k) >= 0 && pitchFor(k) < PITCHES.length);
assert.ok(new Set(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'].map(pitchFor)).size > 1); // a week is not one pitch

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
assert.equal(accidentalFor(1, 'G'), '♯'); // F in G major is written with a sharp
assert.equal(accidentalFor(4, 'F'), '♭'); // B in F major with a flat
assert.equal(accidentalFor(4, 'G'), ''); // B in G major is natural

// --- value ----------------------------------------------------------------
assert.deepEqual(valueFor(20, 60), { f: 3 / 8, glyph: '\u{1D15F}', dotted: true }); // a third → dotted quarter
assert.equal(valueFor(60, 60).glyph, '\u{1D15D}'); // goal met → whole
assert.equal(valueFor(90, 60).glyph, '\u{1D15D}'); // beaten → still whole
assert.equal(valueFor(1, 60).glyph, '\u{1D160}'); // barely anything → eighth
assert.equal(valueFor(30, 60).glyph, '\u{1D15E}'); // half
assert.equal(valueFor(45, 60).dotted, true); // dotted half

// --- bars -----------------------------------------------------------------
const bars = barsFor(['2026-09-14', '2026-09-15', '2026-09-16'], { '2026-09-14': 5, '2026-09-16': 45 });
assert.equal(bars.length, 3);
assert.deepEqual(bars[1].notes, []); // a day off is an empty bar
assert.equal(bars[2].notes.length, 1);
assert.equal(bars[2].notes[0].min, 45);
assert.equal(bars[2].notes[0].pitch, pitchFor('2026-09-16'));

// --- alterations ----------------------------------------------------------
// alterationFor is what midiFor and accidentalFor both read: a signature
// raises, lowers or leaves a note, never anything else.
import { alterationFor } from '../src/lib/melody.ts';
assert.equal(alterationFor(1, 'G'), 1); // F is sharpened in G major
assert.equal(alterationFor(4, 'F'), -1); // B is flattened in F major
for (let p = 0; p < PITCHES.length; p++) assert.equal(alterationFor(p, 'C'), 0, 'C major alters nothing');
const GLYPH: Record<string, string> = { '-1': '\u{266D}', '0': '', '1': '\u{266F}' };
for (const key of KEYS)
  for (let p = 0; p < PITCHES.length; p++) {
    const a = alterationFor(p, key);
    assert.ok(a === -1 || a === 0 || a === 1, `${key}/${p} alteration ${a}`);
    assert.equal(midiFor(p, key) - midiFor(p, 'C'), a, 'midiFor is the natural plus the alteration');
    assert.equal(accidentalFor(p, key), GLYPH[String(a)], `${key}/${p} accidental`);
  }
// a key signature is all sharps or all flats, never a mix
for (const key of KEYS) {
  const alts = new Set([...Array(PITCHES.length).keys()].map((p) => alterationFor(p, key)).filter(Boolean));
  assert.ok(alts.size <= 1, `${key} mixes sharps and flats`);
}

console.log('check-melody ok');
