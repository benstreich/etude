// Self-check for the pure metronome math. Run: npm run check:metronome
import assert from 'node:assert/strict';

import { accentLevel, bpmAfter, clampBpm, describeRamp, parseSig, tapTempo, type Ramp } from '../src/lib/metronome-math.ts';

const off: Ramp = { on: false, step: 2, every: 4, unit: 'bars', target: 140 };
const up: Ramp = { on: true, step: 2, every: 4, unit: 'bars', target: 140 };
const down: Ramp = { on: true, step: 5, every: 30, unit: 'seconds', target: 60 };
const at = (bars: number, seconds: number) => ({ bars, seconds });

// a ramp that is off never moves
assert.equal(bpmAfter(100, off, at(999, 999)), 100);

// steps land on whole multiples only, and hold until the next one
assert.equal(bpmAfter(100, up, at(0, 0)), 100);
assert.equal(bpmAfter(100, up, at(3, 7)), 100);
assert.equal(bpmAfter(100, up, at(4, 9)), 102);
assert.equal(bpmAfter(100, up, at(9, 20)), 104);

// the target is a ceiling going up and a floor going down
assert.equal(bpmAfter(100, up, at(1000, 2000)), 140);
assert.equal(bpmAfter(100, down, at(0, 61)), 90);
assert.equal(bpmAfter(100, down, at(0, 99999)), 60);

// direction comes from the target, so a target below the start ramps down
assert.equal(bpmAfter(100, { ...up, target: 80 }, at(4, 9)), 98);
// ...and a target equal to the start does nothing
assert.equal(bpmAfter(100, { ...up, target: 100 }, at(4, 9)), 100);

// nonsense settings are inert rather than infinite loops or NaN
assert.equal(bpmAfter(100, { ...up, every: 0 }, at(4, 9)), 100);
assert.equal(bpmAfter(100, { ...up, step: 0 }, at(4, 9)), 100);

// a unit written by an older version counts bars rather than blowing up
assert.equal(bpmAfter(100, { ...up, unit: 'beats' as Ramp['unit'] }, at(4, 9)), 102);

// tempo stays inside the dial's range whatever the ramp asks for
assert.equal(bpmAfter(290, { ...up, step: 50, target: 400 }, at(4, 9)), 300);
assert.equal(clampBpm(3.4), 20);

assert.equal(describeRamp(100, up), '+2 BPM every 4 bars → 140');
assert.equal(describeRamp(100, { ...up, every: 1 }), '+2 BPM every 1 bar → 140');
assert.equal(describeRamp(100, { ...up, unit: 'seconds' }), '+2 BPM every 4 seconds → 140');
assert.equal(describeRamp(100, off), null);
assert.equal(describeRamp(140, up), null);

// tap tempo averages the gaps and ignores the ones that were clearly not taps
assert.equal(tapTempo([1000]), null);
assert.equal(tapTempo([0, 500, 1000, 1500]), 120);
assert.equal(tapTempo([0, 99999, 100499]), 120);

// signatures parse, and garbage falls back to 4/4 instead of crashing the sheet
assert.deepEqual(parseSig('6/8'), { beats: 6, denom: 8 });
assert.deepEqual(parseSig('12/8'), { beats: 12, denom: 8 });
assert.deepEqual(parseSig('nonsense'), { beats: 4, denom: 4 });
assert.deepEqual(parseSig('99/3'), { beats: 4, denom: 4 });

// 4/4: downbeat only. 6/8: downbeat + a lighter click on beat 4. 1/4: flat.
const four = parseSig('4/4');
assert.deepEqual([0, 1, 2, 3].map((i) => accentLevel(i, four)), [2, 0, 0, 0]);
const six = parseSig('6/8');
assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => accentLevel(i, six)), [2, 0, 0, 1, 0, 0]);
assert.equal(accentLevel(9, six), 1); // second bar, beat 4
const twelve = parseSig('12/8');
assert.deepEqual([0, 3, 6, 9].map((i) => accentLevel(i, twelve)), [2, 1, 1, 1]);
// 3/8 is a single group - no mid accent; 7/8 groupings vary by piece, so downbeat only
assert.deepEqual([0, 1, 2].map((i) => accentLevel(i, parseSig('3/8'))), [2, 0, 0]);
assert.deepEqual([0, 2, 4].map((i) => accentLevel(i, parseSig('7/8'))), [2, 0, 0]);
assert.equal(accentLevel(5, parseSig('1/4')), 0);

console.log('metronome math ok');
