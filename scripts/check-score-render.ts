// An imported score's page layout (#92): eighths become the engraver's values
// exactly, beams follow the beat, systems wrap with a header on every line and
// key changes land where they happen. Run: npm run check:score-render
import assert from 'node:assert/strict';

import { headerW } from '../src/lib/engrave.ts';
import { parseMusicXml, type ScoreMeasure } from '../src/lib/musicxml.ts';
import { SAMPLE_MUSICXML } from '../src/lib/sample-score.ts';
import { barNotes, beamGroupFor, layoutScore, SCORE_GOAL } from '../src/lib/score-render.ts';

const S = 12;
const nt = (step: number, eighths: number, extra: Partial<{ rest: boolean; dotted: boolean; acc: 'sharp' | 'flat' | 'natural' }> = {}) => ({ step, alter: 0 as const, midi: 60, eighths, ...extra });
const measure = (notes: ReturnType<typeof nt>[], extra: Partial<ScoreMeasure> = {}): ScoreMeasure => ({ notes, ...extra });

// --- eighths map onto the engraver's values one to one ---
assert.equal(SCORE_GOAL, 8);
{
  const m = measure([nt(0, 1), nt(1, 2), nt(2, 3), nt(3, 4), nt(4, 6), nt(5, 8), nt(6, 12), nt(7, 16)]);
  const notes = barNotes(m, 3);
  assert.deepEqual(notes.map((n) => n.min), [1, 2, 3, 4, 6, 8, 12, 16]);
  assert.deepEqual(notes.map((n) => n.pitch), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(notes.map((n) => n.id), ['3.0', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7']);
  const sys = layoutScore([m], 5000, S);
  const heads = sys[0].bars[0].lay!.notes.map((n) => [n.head, n.dot !== null]);
  assert.deepEqual(heads, [
    ['eighth', false],
    ['quarter', false],
    ['quarter', true],
    ['half', false],
    ['half', true],
    ['whole', false],
    ['whole', true],
    ['breve', false],
  ]);
}
// rests and accidentals ride along
{
  const notes = barNotes(measure([nt(0, 2, { rest: true }), nt(9, 2, { acc: 'sharp' })]), 0);
  assert.equal(notes[0].rest, true);
  assert.equal(notes[0].acc, undefined);
  assert.equal(notes[1].rest, undefined);
  assert.equal(notes[1].acc, 'sharp');
}

// --- beam groups follow the beat ---
assert.equal(beamGroupFor(null), 2, 'no meter: by the quarter');
assert.equal(beamGroupFor({ n: 4, d: 4 }), 2);
assert.equal(beamGroupFor({ n: 3, d: 4 }), 2);
assert.equal(beamGroupFor({ n: 2, d: 2 }), 4, 'a half-note beat');
assert.equal(beamGroupFor({ n: 6, d: 8 }), 3, 'compound: the dotted quarter');
assert.equal(beamGroupFor({ n: 9, d: 8 }), 3);
assert.equal(beamGroupFor({ n: 12, d: 8 }), 3);
assert.equal(beamGroupFor({ n: 5, d: 8 }), 1, 'a plain eighth beat');
assert.equal(beamGroupFor({ n: 4, d: 16 }), 1, 'nothing shorter than an eighth is written');
{
  // eight eighths in 4/4: four beams of two, not one beam of eight
  const sys = layoutScore([measure(Array.from({ length: 8 }, (_, i) => nt(i, 1)), { meter: { n: 4, d: 4 } })], 5000, S);
  assert.equal(sys[0].bars[0].lay!.beams.length, 4);
  // the same eighths in 6/8: two beams of three
  const six = layoutScore([measure(Array.from({ length: 6 }, (_, i) => nt(i, 1)), { meter: { n: 6, d: 8 } })], 5000, S);
  assert.equal(six[0].bars[0].lay!.beams.length, 2);
  // the meter persists into the bars after the one that wrote it
  const two = layoutScore([measure([nt(0, 8)], { meter: { n: 6, d: 8 } }), measure(Array.from({ length: 6 }, (_, i) => nt(i, 1)))], 5000, S);
  assert.equal(two[0].bars[1].lay!.beams.length, 2);
}

// --- wrapping: every bar once, in order, systems no wider than the page, a header on each ---
{
  const measures = Array.from({ length: 20 }, (_, i) => measure([nt(i % 9, 2), nt((i + 3) % 9, 2), nt((i + 5) % 9, 2), nt((i + 7) % 9, 2)], i === 0 ? { meter: { n: 4, d: 4 }, key: 2 } : {}));
  const width = 340;
  const systems = layoutScore(measures, width, S);
  assert.ok(systems.length > 3, 'twenty bars do not fit on three lines of a phone');
  const seen = systems.flatMap((sys) => sys.bars.map((b) => b.index));
  assert.deepEqual(seen, measures.map((_, i) => i));
  for (const sys of systems) {
    assert.equal(sys.sig, 2, 'the key in force is on every system');
    assert.equal(sys.headW, headerW(2, S));
    assert.ok(sys.headW + sys.width <= width + 0.001, `system overflows: ${sys.headW + sys.width} > ${width}`);
    assert.ok(sys.bars.length >= 1);
    let x = 0;
    for (const b of sys.bars) {
      assert.ok(Math.abs(b.x - x) < 0.001, 'bars sit end to end');
      x += b.width;
      assert.ok(b.width >= b.natural - 0.001, 'justification only ever widens a bar');
      assert.equal(b.keyChange, null, 'no key change after the first bar');
    }
  }
  // full systems are justified to the page; the last stays ragged when mostly empty
  for (const sys of systems.slice(0, -1)) assert.ok(Math.abs(sys.headW + sys.width - width) < 0.001, 'an inner system is justified');
  // the meter is written on the first bar only
  assert.deepEqual(systems[0].bars[0].meter, { n: 4, d: 4 });
  assert.ok(systems.flatMap((s) => s.bars).slice(1).every((b) => b.meter === null));
}

// --- key changes: inside a system they get a column; at a system start the header carries them ---
{
  const short = () => measure([nt(4, 8)]);
  // wide page: everything on one line, so the change in bar 3 is written inside the bar
  const one = layoutScore([measure([nt(4, 8)], { key: 0 }), short(), measure([nt(4, 8)], { key: -2 }), short()], 5000, S);
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].bars.map((b) => b.keyChange), [null, null, -2, null]);
  assert.deepEqual(one[0].bars.map((b) => b.sig), [0, 0, -2, -2]);
  assert.equal(one[0].sig, 0);
  assert.ok(one[0].bars[2].natural > one[0].bars[1].natural, 'the key column costs width');
  // a page just wide enough for two bars under the wider (two-flat) header: bar 3
  // opens the second system, whose header shows the new key
  const twoW = headerW(-2, S) + one[0].bars[0].natural * 2 + 1;
  const two = layoutScore([measure([nt(4, 8)], { key: 0 }), short(), measure([nt(4, 8)], { key: -2 }), short()], twoW, S);
  assert.equal(two.length, 2);
  assert.equal(two[1].sig, -2);
  assert.equal(two[1].headW, headerW(-2, S));
  assert.equal(two[1].bars[0].keyChange, null, 'the header carries it — no column');
  // the same key restated is no change
  const same = layoutScore([measure([nt(4, 8)], { key: 1 }), measure([nt(4, 8)], { key: 1 })], 5000, S);
  assert.deepEqual(same[0].bars.map((b) => b.keyChange), [null, null]);
}

// --- empty measures draw as a rest column, and a lone over-wide bar stands alone ---
{
  const sys = layoutScore([measure([]), measure([nt(0, 2)])], 5000, S);
  assert.equal(sys[0].bars[0].lay, null);
  assert.ok(sys[0].bars[0].natural > 0);
  assert.ok(sys[0].bars[1].lay);
  assert.deepEqual(layoutScore([], 300, S), []);
  const wide = layoutScore([measure(Array.from({ length: 16 }, (_, i) => nt(i % 9, 16))), measure([nt(0, 2)])], 200, S);
  assert.equal(wide[0].bars.length, 1, 'the giant bar takes a system of its own');
  assert.equal(wide[1].bars[0].index, 1);
}

// --- the bundled example lays out on a phone ---
{
  const score = parseMusicXml(SAMPLE_MUSICXML);
  const systems = layoutScore(score.parts[0].measures, 360, S);
  assert.ok(systems.length >= 2);
  assert.equal(systems.flatMap((s) => s.bars).length, score.parts[0].measures.length);
  assert.ok(systems.every((s) => s.sig === 1), 'G major on every line');
  const placed = systems.flatMap((s) => s.bars).flatMap((b) => b.lay?.notes ?? []);
  assert.ok(placed.some((n) => n.ledger.length > 0), 'C4 and A5 draw ledger lines');
  assert.ok(placed.some((n) => n.rest), 'the rest is placed');
  assert.ok(placed.every((n) => n.acc === null), 'F sharp is in the key — no accidentals printed');
}

console.log('check-score-render: all assertions passed');
