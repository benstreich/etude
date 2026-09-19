// The Home staff's engraving: stem direction, beam grouping, dot placement and
// the pinned clef block. Geometry only — what it looks like is components/motifs.tsx.
import { strict as assert } from 'node:assert';

import {
  BAR_PAD,
  BEAM_T,
  flagPath,
  HEAD_RY,
  headerW,
  headRx,
  holeRx,
  holeRy,
  layoutBar,
  layoutSystems,
  LINE_W,
  METER_COL_W,
  PAD_COL_W,
  REST_COL_W,
  signatureMarks,
  STEM_W,
  yOf,
} from '../src/lib/engrave.ts';
import { KEYS, SIGNATURE } from '../src/lib/melody.ts';

const S = 16;
const GOAL = 60;
const n = (id: string, min: number, pitch: number) => ({ id, min, pitch });

// --- the staff itself -----------------------------------------------------
assert.equal(yOf(4, S), 2 * S); // the middle line
assert.equal(yOf(8, S), 0); // top line
assert.equal(yOf(0, S), 4 * S); // bottom line
assert.equal(yOf(6, S) - yOf(4, S), -S); // two steps is a space, and up is less y
// proportions an engraver would recognise: a head about a space tall, a hairline stem
assert.equal(HEAD_RY(S) * 2, S);
assert.ok(STEM_W(S) < LINE_W(S) * 1.2 && STEM_W(S) > 0);
assert.ok(headRx('whole', S) > headRx('quarter', S), 'the open head is the wider one');
assert.ok(holeRx('quarter', S) < headRx('quarter', S), 'the counter sits inside the head');
assert.ok(holeRy('half', S) < HEAD_RY(S), 'the counter sits inside the head the other way too');
assert.ok(holeRy('whole', S) > holeRy('half', S), 'the open whole head has the larger counter');
assert.ok(BEAM_T(S) > STEM_W(S) * 2, 'a beam reads heavier than the stems it joins');

// --- stems ----------------------------------------------------------------
// down on or above the middle line, up below it — the ordinary rule
for (const p of [4, 5, 6, 7, 8]) assert.equal(layoutBar([n('a', 15, p)], GOAL, S).notes[0].down, true, `pitch ${p} should stem down`);
for (const p of [0, 1, 2, 3]) assert.equal(layoutBar([n('a', 15, p)], GOAL, S).notes[0].down, false, `pitch ${p} should stem up`);
// a stem starts at the head and runs the other way
{
  const up = layoutBar([n('a', 15, 0)], GOAL, S).notes[0];
  assert.ok(up.stem && up.stem.y2 < up.stem.y1, 'an up stem rises');
  assert.ok(up.stem!.x > up.x, 'an up stem rides the right of the head');
  const down = layoutBar([n('a', 15, 8)], GOAL, S).notes[0];
  assert.ok(down.stem && down.stem.y2 > down.stem.y1, 'a down stem falls');
  assert.ok(down.stem!.x < down.x, 'a down stem rides the left of the head');
}
// the open heads carry no stem at all, and everything shorter does
for (const [min, stemmed] of [[7, true], [15, true], [30, true], [45, true], [60, false], [90, false], [120, false]] as const) {
  const one = layoutBar([n('a', min, 2)], GOAL, S).notes[0];
  assert.equal(one.stem !== null, stemmed, `${min} min should ${stemmed ? '' : 'not '}carry a stem`);
}

// --- beams ----------------------------------------------------------------
// two eighths side by side beam; neither keeps a flag
{
  const bar = layoutBar([n('a', 7, 2), n('b', 7, 3)], GOAL, S);
  assert.equal(bar.beams.length, 1);
  assert.ok(bar.notes.every((x) => !x.flag), 'a beamed eighth gives up its flag');
  assert.ok(bar.beams[0].x2 > bar.beams[0].x1, 'the beam runs left to right');
}
// a lone eighth keeps its flag and gets no beam
{
  const bar = layoutBar([n('a', 7, 2), n('b', 30, 3)], GOAL, S);
  assert.equal(bar.beams.length, 0);
  assert.equal(bar.notes[0].flag, true);
}
// a run takes one direction, so the beam has somewhere to sit
{
  const bar = layoutBar([n('a', 7, 0), n('b', 7, 8), n('c', 7, 7)], GOAL, S);
  assert.equal(bar.beams.length, 1);
  assert.equal(new Set(bar.notes.map((x) => x.down)).size, 1, 'a beamed run points one way');
}
// the slope is capped: a beam that chased every leap would be unreadable
{
  const bar = layoutBar([n('a', 7, 0), n('b', 7, 8)], GOAL, S);
  assert.ok(Math.abs(bar.beams[0].y2 - bar.beams[0].y1) <= S + 0.001, 'beam slope is capped at a space');
}
// every stem in a run reaches its beam
{
  const bar = layoutBar([n('a', 7, 1), n('b', 7, 5), n('c', 7, 3)], GOAL, S);
  const { x1, y1, x2, y2 } = bar.beams[0];
  for (const x of bar.notes) {
    const t = (x.stem!.x - x1) / (x2 - x1);
    assert.ok(Math.abs(x.stem!.y2 - (y1 + (y2 - y1) * t)) < 1.5, 'a stem stops short of its beam');
  }
}

// --- dots -----------------------------------------------------------------
// a dot never sits on a staff line: on a line it rides into the space above
{
  const onLine = layoutBar([n('a', 45, 2)], GOAL, S).notes[0]; // pitch 2 is a line
  assert.ok(onLine.dot && Math.abs(onLine.dot.y - (onLine.y - S / 2)) < 0.001);
  const inSpace = layoutBar([n('a', 45, 3)], GOAL, S).notes[0]; // pitch 3 is a space
  assert.ok(inSpace.dot && inSpace.dot.y === inSpace.y);
  assert.ok(inSpace.dot.x > inSpace.x + headRx('half', S), 'the dot stands clear of the head');
}
assert.equal(layoutBar([n('a', 30, 3)], GOAL, S).notes[0].dot, null); // an undotted value has none

// --- spacing --------------------------------------------------------------
// a longer note earns more room, the way engraved music breathes
{
  const short = layoutBar([n('a', 7, 2)], GOAL, S).width;
  const mid = layoutBar([n('a', 30, 2)], GOAL, S).width;
  const long = layoutBar([n('a', 60, 2)], GOAL, S).width;
  assert.ok(short < mid && mid < long, `widths do not grow: ${short} ${mid} ${long}`);
}
// notes never overlap, whatever the bar holds
{
  const bar = layoutBar([n('a', 7, 2), n('b', 60, 5), n('c', 15, 0), n('d', 45, 7)], GOAL, S);
  for (let i = 1; i < bar.notes.length; i++) {
    const prev = bar.notes[i - 1], cur = bar.notes[i];
    assert.ok(cur.x - prev.x > headRx(prev.head, S) + headRx(cur.head, S), `notes ${i - 1} and ${i} collide`);
  }
  assert.ok(bar.width > bar.notes[bar.notes.length - 1].x, 'the bar ends after its last note');
}
assert.equal(layoutBar([], GOAL, S).notes.length, 0); // an empty bar lays out to nothing
assert.equal(layoutBar([], GOAL, S).beams.length, 0);

// --- the clef block -------------------------------------------------------
// every key writes its own signature, and the block widens to hold it
for (const key of KEYS) {
  const sig = SIGNATURE[key];
  const marks = signatureMarks(sig, S);
  assert.equal(marks.length, Math.abs(sig), `${key} should write ${Math.abs(sig)} accidentals`);
  assert.ok(marks.every((m) => m.sharp === sig > 0), `${key} mixes sharps and flats`);
  // they read left to right, none on top of another
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i].x > marks[i - 1].x, `${key} stacks its accidentals`);
  assert.ok(headerW(sig, S) > (marks.at(-1)?.x ?? 0), `${key} signature overflows the pinned block`);
}
assert.equal(signatureMarks(0, S).length, 0); // C major writes none
assert.ok(headerW(6, S) > headerW(0, S), 'six sharps need more room than none');
// the F sharp of G major goes on the top line, where a reader expects it
assert.ok(Math.abs(signatureMarks(1, S)[0].y - yOf(8, S)) < 0.001);
// the B flat of F major goes on the middle line
assert.ok(Math.abs(signatureMarks(-1, S)[0].y - yOf(4, S)) < 0.001);

// --- the flag -------------------------------------------------------------
// a path, closed, and mirrored about the stem end for an up or a down stem
for (const down of [true, false]) {
  const d = flagPath(10, 20, down, S);
  assert.ok(d.startsWith('M 10 20') && d.trim().endsWith('z'), `flag path is not closed: ${d}`);
  assert.ok(!/NaN|undefined/.test(d), `flag path has holes: ${d}`);
}

// --- the full score: systems -----------------------------------------------
// the fixed column overheads scale with the staff space, same as everything else
assert.equal(BAR_PAD(10), 4);
assert.equal(METER_COL_W(10), 14.5);
assert.equal(REST_COL_W(10), 22);
assert.equal(PAD_COL_W(10), 16);
{
  const bar = (date: string, mins: number[]) => ({ date, notes: mins.map((m, i) => ({ id: `${date}-${i}`, min: m, pitch: 2 })) });
  const GOAL2 = 60;

  // the meter is a property of the log: written on the first bar, quiet while
  // it holds (a rest between two equal bars doesn't reset it), written again
  // only on a real change
  const logBars = [bar('d1', [60]), bar('d2', [60]), bar('d3', []), bar('d4', [60]), bar('d5', [120])];
  const flat = layoutSystems(logBars, GOAL2, 1000, S).flatMap((sys) => sys.bars);
  assert.equal(flat[0].meter, 4, 'first bar always writes its meter');
  assert.equal(flat[1].meter, null, 'an unchanged meter stays quiet');
  assert.equal(flat[2].meter, null, 'a rest never writes a meter');
  assert.equal(flat[3].meter, null, 'the meter carries across the day off it just crossed');
  assert.equal(flat[4].meter, 8, 'a real change writes again');

  // wrapping: every system stays inside its own capacity, and a bar never
  // runs past the system it landed in
  const many = Array.from({ length: 20 }, (_, i) => bar(`w${i}`, [30]));
  const narrow = layoutSystems(many, GOAL2, 120, S);
  assert.ok(narrow.length > 1, 'twenty bars at a 120px line wrap into more than one system');
  for (const sys of narrow) {
    assert.ok(sys.width <= 120.01, `a system (${sys.width}) exceeds its 120px capacity`);
    const last = sys.bars.at(-1)!;
    assert.ok(last.x + last.width <= sys.width + 0.01, 'a bar runs past the end of its own system');
  }

  // the clef-and-signature block narrows only the first system
  const uniform = layoutSystems(many, GOAL2, 300, S);
  const narrowedFirst = layoutSystems(many, GOAL2, 300, S, 90);
  assert.ok(narrowedFirst[0].bars.length < uniform[0].bars.length, 'a narrower first system should hold fewer bars');
  assert.ok(narrowedFirst[0].width <= 90.01, 'the first system should not exceed the narrower capacity it was given');
  assert.ok(narrowedFirst[1].width <= 300.01, 'a later system is unaffected by the first system’s narrower capacity');
}

console.log('check-engrave ok');
