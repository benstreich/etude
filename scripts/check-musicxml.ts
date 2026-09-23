// MusicXML import (#92): the parser's exact v1 decisions, on inline fixtures.
// Run: npm run check:musicxml
import assert from 'node:assert/strict';

import {
  isCompressedMusicXml,
  isDotted,
  keyAlteration,
  midiFor,
  MusicXmlError,
  parseMusicXml,
  quantizeEighths,
  stepFor,
  WRITABLE_EIGHTHS,
} from '../src/lib/musicxml.ts';
import { SAMPLE_MUSICXML } from '../src/lib/sample-score.ts';

// --- staff arithmetic ---
assert.equal(stepFor('E', 4), 0, 'E4 is the bottom line');
assert.equal(stepFor('C', 4), -2);
assert.equal(stepFor('B', 4), 4, 'the middle line');
assert.equal(stepFor('F', 5), 8, 'the top line');
assert.equal(stepFor('A', 5), 10);
assert.equal(stepFor('C', 6), 12);
assert.equal(stepFor('G', 3), -5);
assert.equal(midiFor('C', 4, 0), 60);
assert.equal(midiFor('A', 4, 0), 69);
assert.equal(midiFor('B', 3, -1), 58);
assert.equal(midiFor('F', 5, 1), 78);
assert.equal(keyAlteration(0, 'F'), 0);
assert.equal(keyAlteration(1, 'F'), 1, 'G major sharpens F');
assert.equal(keyAlteration(1, 'C'), 0);
assert.equal(keyAlteration(2, 'C'), 1);
assert.equal(keyAlteration(-1, 'B'), -1, 'F major flattens B');
assert.equal(keyAlteration(-3, 'A'), -1);
assert.equal(keyAlteration(-3, 'D'), 0);

// --- quantization to the engraver's table ---
assert.deepEqual(WRITABLE_EIGHTHS, [1, 2, 3, 4, 6, 8, 12, 16]);
assert.deepEqual(quantizeEighths(2), { eighths: 2, exact: true });
assert.deepEqual(quantizeEighths(3), { eighths: 3, exact: true });
assert.deepEqual(quantizeEighths(0.5), { eighths: 1, exact: false }, 'a sixteenth rounds up to an eighth');
assert.deepEqual(quantizeEighths(2 / 3), { eighths: 1, exact: false }, 'a triplet eighth');
assert.deepEqual(quantizeEighths(24), { eighths: 16, exact: false }, 'longer than a breve saturates');
assert.deepEqual(quantizeEighths(0), { eighths: 1, exact: false });
assert.equal(isDotted(3), true);
assert.equal(isDotted(6), true);
assert.equal(isDotted(12), true);
assert.equal(isDotted(4), false);

// --- compressed detection ---
assert.equal(isCompressedMusicXml('minuet.mxl', '<?xml'), true);
assert.equal(isCompressedMusicXml('Minuet.MXL', '<?xml'), true);
assert.equal(isCompressedMusicXml('minuet.xml', 'PK'), true);
assert.equal(isCompressedMusicXml('minuet.musicxml', '<?xml'), false);
assert.equal(isCompressedMusicXml(undefined, '<?xml'), false);

// --- fixtures ---
const wrap = (measures: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  ${extra}
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
const attrs = (divisions: number, fifths = 0, time?: [number, number]) =>
  `<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths></key>${time ? `<time><beats>${time[0]}</beats><beat-type>${time[1]}</beat-type></time>` : ''}<clef><sign>G</sign><line>2</line></clef></attributes>`;
const note = (step: string, octave: number, duration: number, extra = '', alter?: number) =>
  `<note><pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`;
const rest = (duration: number, extra = '') => `<note><rest/><duration>${duration}</duration>${extra}</note>`;

// divisions=1: a quarter note is 2 eighths; the title comes from the work
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1, 0, [4, 4])}${note('C', 5, 1)}${note('D', 5, 1)}${note('E', 5, 2)}</measure>`, '<work><work-title>Étude No. 1</work-title></work>'));
  assert.equal(sp.title, 'Étude No. 1');
  assert.equal(sp.parts.length, 1);
  assert.equal(sp.parts[0].measures.length, 1);
  const m = sp.parts[0].measures[0];
  assert.deepEqual(m.meter, { n: 4, d: 4 });
  assert.equal(m.key, 0);
  assert.deepEqual(
    m.notes.map((n) => [n.step, n.eighths, n.midi]),
    [
      [5, 2, 72],
      [6, 2, 74],
      [7, 4, 76],
    ],
  );
  assert.equal(sp.skipped, 0);
  assert.equal(m.notes[0].dotted, undefined);
  assert.equal(m.notes[0].acc, undefined, 'a C in C major carries no accidental');
}

// movement-title when there is no work; no title at all stays undefined
assert.equal(parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 4, 4)}</measure>`, '<movement-title>Sarabande</movement-title>')).title, 'Sarabande');
assert.equal(parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 4, 4)}</measure>`)).title, undefined);

// divisions redeclared mid-piece; dotted quarter → 3 eighths, dotted
{
  const sp = parseMusicXml(
    wrap(`<measure number="1">${attrs(2, 0, [3, 4])}${note('G', 4, 3)}${note('A', 4, 1)}${note('B', 4, 2)}</measure><measure number="2"><attributes><divisions>4</divisions></attributes>${note('C', 5, 6)}${note('D', 5, 2)}${note('E', 5, 4)}</measure>`),
  );
  const [m1, m2] = sp.parts[0].measures;
  assert.deepEqual(m1.notes.map((n) => [n.eighths, !!n.dotted]), [[3, true], [1, false], [2, false]]);
  assert.deepEqual(m2.notes.map((n) => [n.eighths, !!n.dotted]), [[3, true], [1, false], [2, false]]);
  assert.equal(m2.meter, undefined, 'the meter is written once, not on every measure');
  assert.equal(m2.key, undefined);
  assert.equal(sp.skipped, 0);
}

// a tie across the barline merges into one note in the first measure; the second measure loses it
{
  const sp = parseMusicXml(
    wrap(`<measure number="1">${attrs(1, 0, [4, 4])}${note('E', 5, 2)}${note('G', 5, 2, '<tie type="start"/><notations><tied type="start"/></notations>')}</measure><measure number="2">${note('G', 5, 2, '<tie type="stop"/><notations><tied type="stop"/></notations>')}${note('F', 5, 2)}</measure>`),
  );
  const [m1, m2] = sp.parts[0].measures;
  assert.deepEqual(m1.notes.map((n) => [n.step, n.eighths]), [[7, 4], [9, 8]]);
  assert.deepEqual(m2.notes.map((n) => [n.step, n.eighths]), [[8, 4]]);
  assert.equal(sp.skipped, 0);
}
// a tie chain (start, start+stop, stop) becomes one note; a tie to a different pitch does not merge
{
  const chain = parseMusicXml(
    wrap(`<measure number="1">${attrs(1)}${note('C', 5, 2, '<tie type="start"/>')}${note('C', 5, 2, '<tie type="stop"/><tie type="start"/>')}${note('C', 5, 4, '<tie type="stop"/>')}</measure>`),
  );
  assert.deepEqual(chain.parts[0].measures[0].notes.map((n) => n.eighths), [16]);
  const wrong = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 5, 2, '<tie type="start"/>')}${note('D', 5, 2, '<tie type="stop"/>')}</measure>`));
  assert.deepEqual(wrong.parts[0].measures[0].notes.map((n) => n.eighths), [4, 4]);
}
// a slur is articulation and changes nothing
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 5, 1, '<notations><slur type="start" number="1"/></notations>')}${note('D', 5, 1, '<notations><slur type="stop" number="1"/></notations>')}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => n.eighths), [2, 2]);
  assert.equal(sp.skipped, 0);
}

// a chord keeps its top note and counts the rest; the top note need not come first
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('E', 4, 2)}${note('G', 4, 2, '<chord/>')}${note('C', 5, 2, '<chord/>')}${note('A', 5, 2)}${note('F', 4, 2, '<chord/>')}</measure>`));
  const m = sp.parts[0].measures[0];
  assert.deepEqual(m.notes.map((n) => [n.step, n.midi]), [[5, 72], [10, 81]]);
  assert.equal(sp.skipped, 3);
}

// grace notes are dropped and counted; the note they lead to keeps its length
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}<note><grace/><pitch><step>D</step><octave>5</octave></pitch><type>eighth</type></note>${note('C', 5, 4)}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => [n.step, n.eighths]), [[5, 8]]);
  assert.equal(sp.skipped, 1);
}

// a triplet group counts once, and its notes are quantized
{
  const tm = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(3)}${note('C', 5, 2, tm)}${note('D', 5, 2, tm)}${note('E', 5, 2, tm)}${note('F', 5, 6)}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => n.eighths), [1, 1, 1, 4]);
  // one for the group, one per inexact duration
  assert.equal(sp.skipped, 4);
}

// a second voice is filtered out; <backup> and <forward> never crash
{
  const sp = parseMusicXml(
    wrap(`<measure number="1">${attrs(1)}${note('C', 5, 2, '<voice>1</voice>')}${note('D', 5, 2, '<voice>1</voice>')}<backup><duration>4</duration></backup>${note('C', 4, 4, '<voice>2</voice>')}<forward><duration>2</duration></forward></measure>`),
  );
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => n.step), [5, 6]);
  assert.equal(sp.skipped, 1);
}
// a second staff of the same part (piano left hand) is filtered like a voice
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 5, 4, '<staff>1</staff>')}<backup><duration>4</duration></backup>${note('C', 3, 4, '<staff>2</staff>')}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => n.step), [5]);
  assert.equal(sp.skipped, 1);
}
// only the first part is read
{
  const xml = `<?xml version="1.0"?><score-partwise><part-list/><part id="P1"><measure number="1">${attrs(1)}${note('C', 5, 4)}</measure></part><part id="P2"><measure number="1">${attrs(1)}${note('C', 3, 4)}</measure></part></score-partwise>`;
  assert.deepEqual(parseMusicXml(xml).parts[0].measures[0].notes.map((n) => n.step), [5]);
}

// rests: kept in place, whole-measure rests included, dotted when the length says so
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(2, 0, [4, 4])}${rest(4)}${note('C', 5, 6)}${rest(6)}</measure><measure number="2"><note><rest measure="yes"/><duration>16</duration></note></measure>`));
  const [m1, m2] = sp.parts[0].measures;
  assert.deepEqual(m1.notes.map((n) => [!!n.rest, n.eighths, !!n.dotted]), [[true, 4, false], [false, 6, true], [true, 6, true]]);
  assert.deepEqual(m2.notes.map((n) => [!!n.rest, n.eighths]), [[true, 16]]);
  assert.equal(sp.skipped, 0);
}

// ledger-line pitches: C4 → step -2, A5 → 10
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('C', 4, 2)}${note('A', 5, 2)}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => n.step), [-2, 10]);
}

// accidentals: <accidental> wins when present; otherwise inferred against the key and the bar
{
  const sp = parseMusicXml(
    wrap(
      `<measure number="1">${attrs(1, 1, [4, 4])}${note('F', 5, 1, '', 1)}${note('F', 5, 1, '', 0)}${note('F', 5, 1, '', 0)}${note('B', 4, 1, '', -1)}</measure>` +
        `<measure number="2">${note('F', 5, 2, '', 1)}${note('C', 5, 2, '<accidental>sharp</accidental>', 1)}${note('G', 4, 2, '<accidental>natural</accidental>', 0)}${note('E', 5, 2, '', 0)}</measure>`,
    ),
  );
  const [m1, m2] = sp.parts[0].measures;
  // G major: F# is in the key → no sign; F natural gets a natural, the next F natural in the bar none; Bb gets a flat
  assert.deepEqual(m1.notes.map((n) => [n.alter, n.acc ?? null]), [[1, null], [0, 'natural'], [0, null], [-1, 'flat']]);
  // new bar: F# again implied by the key; explicit signs are printed as written
  assert.deepEqual(m2.notes.map((n) => [n.alter, n.acc ?? null]), [[1, null], [1, 'sharp'], [0, 'natural'], [0, null]]);
  assert.equal(sp.skipped, 0);
}
// a double sharp is clamped and counted
{
  const sp = parseMusicXml(wrap(`<measure number="1">${attrs(1)}${note('F', 5, 4, '', 2)}</measure>`));
  assert.deepEqual(sp.parts[0].measures[0].notes.map((n) => [n.alter, n.midi]), [[1, 78]]);
  assert.equal(sp.skipped, 1);
}

// a key change lands on the measure that declares it; a meter change likewise; a bass clef counts once
{
  const sp = parseMusicXml(
    wrap(
      `<measure number="1">${attrs(1, 0, [4, 4])}${note('C', 5, 4)}</measure>` +
        `<measure number="2">${note('C', 5, 4)}</measure>` +
        `<measure number="3"><attributes><key><fifths>-2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>${note('B', 4, 3, '', -1)}</measure>` +
        `<measure number="4"><attributes><key><fifths>-2</fifths></key></attributes>${note('C', 5, 3)}</measure>`,
    ),
  );
  const ms = sp.parts[0].measures;
  assert.deepEqual(ms.map((m) => m.key ?? null), [0, null, -2, null]);
  assert.deepEqual(ms.map((m) => m.meter ?? null), [{ n: 4, d: 4 }, null, { n: 3, d: 4 }, null]);
  assert.equal(ms[2].notes[0].acc, undefined, 'Bb is in the new key');
  assert.equal(sp.skipped, 1);
}

// unusable input throws MusicXmlError — nothing half-parsed comes back
assert.throws(() => parseMusicXml(''), MusicXmlError);
assert.throws(() => parseMusicXml('not xml at all'), MusicXmlError);
assert.throws(() => parseMusicXml('<score-partwise><part><measure>'), MusicXmlError, 'unclosed tags');
assert.throws(() => parseMusicXml('<?xml version="1.0"?><html><body/></html>'), MusicXmlError, 'well-formed, not MusicXML');
assert.throws(() => parseMusicXml('<?xml version="1.0"?><score-timewise><measure/></score-timewise>'), MusicXmlError, 'timewise is not supported');
assert.throws(() => parseMusicXml('<?xml version="1.0"?><score-partwise><part-list/></score-partwise>'), MusicXmlError, 'no part');
assert.throws(() => parseMusicXml('<?xml version="1.0"?><score-partwise><part id="P1"/></score-partwise>'), MusicXmlError, 'no measures');
assert.throws(() => parseMusicXml('PKzipped'), MusicXmlError, 'a compressed .mxl');
assert.throws(() => parseMusicXml('﻿' + 'garbage'), MusicXmlError);

// a BOM and comments are tolerated
{
  const sp = parseMusicXml('﻿' + wrap(`<!-- exported --><measure number="1">${attrs(1)}${note('C', 5, 4)}</measure>`));
  assert.equal(sp.parts[0].measures.length, 1);
}

// the bundled example parses clean: every note writable, nothing skipped
{
  const sp = parseMusicXml(SAMPLE_MUSICXML);
  assert.ok(sp.title);
  assert.equal(sp.skipped, 0);
  assert.ok(sp.parts[0].measures.length >= 8);
  assert.ok(sp.parts[0].measures.some((m) => m.notes.some((n) => n.step < 0 || n.step > 8)), 'the example exercises ledger lines');
  assert.ok(sp.parts[0].measures.some((m) => m.notes.some((n) => n.rest)), 'and a rest');
  assert.deepEqual(sp.parts[0].measures[0].meter, { n: 3, d: 4 });
}

console.log('check-musicxml: all assertions passed');
