// Self-check for the pure metronome math. Run: npm run check:metronome
import assert from 'node:assert/strict';

import {
  accentLevel,
  bpmAfter,
  clampBpm,
  clampSound,
  clampSubdiv,
  clampVolume,
  cycleLevel,
  ACCENT,
  defaultAccents,
  isCompound,
  MID,
  PLAIN,
  describeRamp,
  fitAccents,
  parseSig,
  tapTempo,
  advanceTick,
  MIN_LEAD,
  nextTick,
  RESYNC_AFTER_MS,
  tickInterval,
  volumeGain,
  type Ramp,
} from '../src/lib/metronome-math.ts';

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

// Levels: 0 muted, 1 plain, 2 group start, 3 downbeat.
// 4/4: downbeat only. 6/8: downbeat + a lighter click on beat 4. 1/4: flat.
const four = parseSig('4/4');
assert.deepEqual([0, 1, 2, 3].map((i) => accentLevel(i, four)), [3, 1, 1, 1]);
const six = parseSig('6/8');
assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => accentLevel(i, six)), [3, 1, 1, 2, 1, 1]);
assert.equal(accentLevel(9, six), 2); // second bar, beat 4
const twelve = parseSig('12/8');
assert.deepEqual([0, 3, 6, 9].map((i) => accentLevel(i, twelve)), [3, 2, 2, 2]);
// 3/8 is a single group - no mid accent; 7/8 groupings vary by piece, so downbeat only
assert.deepEqual([0, 1, 2].map((i) => accentLevel(i, parseSig('3/8'))), [3, 1, 1]);
assert.deepEqual([0, 2, 4].map((i) => accentLevel(i, parseSig('7/8'))), [3, 1, 1]);
assert.equal(accentLevel(5, parseSig('1/4')), 1);

// --- accent patterns (#57) --------------------------------------------
// an edited bar wins over the default, and repeats bar after bar
const backbeat = [0, 3, 0, 3];
assert.deepEqual([0, 1, 2, 3].map((i) => accentLevel(i, four, backbeat)), [0, 3, 0, 3]);
assert.deepEqual([4, 5, 6, 7].map((i) => accentLevel(i, four, backbeat)), [0, 3, 0, 3]);
// the defaults are what the signature implied before patterns existed
assert.deepEqual(defaultAccents(four), [3, 1, 1, 1]);
assert.deepEqual(defaultAccents(six), [3, 1, 1, 2, 1, 1]);
assert.deepEqual(defaultAccents(parseSig('1/4')), [1]);
// a pattern from another signature is cut or topped up, never left ragged
assert.deepEqual(fitAccents([0, 3, 0, 3], parseSig('3/4')), [0, 3, 0]);
assert.deepEqual(fitAccents([0, 3], six), [0, 3, 1, 2, 1, 1]);
assert.deepEqual(fitAccents([], four), [3, 1, 1, 1]);
assert.deepEqual(fitAccents(undefined, four), [3, 1, 1, 1]);
// garbage in a saved pattern clamps instead of playing a bank that isn't there
assert.deepEqual(fitAccents([9, -4, NaN, 1.6], four), [3, 0, 1, 2]);
// tapping a dot walks all four states and comes back round
assert.deepEqual([3, 2, 1, 0].map(cycleLevel), [2, 1, 0, 3]);

// --- subdivisions (#57) -----------------------------------------------
// without subdivisions every tick is a beat
assert.deepEqual(advanceTick({ beats: 0, sub: 0 }, 1), { beats: 1, sub: 0 });
// with them, the beat only turns over on the last tick of the beat
assert.deepEqual(advanceTick({ beats: 0, sub: 0 }, 3), { beats: 0, sub: 1 });
assert.deepEqual(advanceTick({ beats: 0, sub: 1 }, 3), { beats: 0, sub: 2 });
assert.deepEqual(advanceTick({ beats: 0, sub: 2 }, 3), { beats: 1, sub: 0 });
// one bar of 4/4 in triplets is 12 ticks and lands back on a beat
let pos = { beats: 0, sub: 0 };
for (let i = 0; i < 12; i++) pos = advanceTick(pos, 3);
assert.deepEqual(pos, { beats: 4, sub: 0 });
// shrinking the subdivision mid-beat rolls over at the next tick, it doesn't strand the count
assert.deepEqual(advanceTick({ beats: 2, sub: 3 }, 2), { beats: 3, sub: 0 });
// anything that isn't a shipped subdivision means "just the beat"
assert.equal(clampSubdiv(5), 1);
assert.equal(clampSubdiv(0), 1);
assert.equal(clampSubdiv(3), 3);

// --- sound sets and volume (#57) --------------------------------------
assert.equal(clampSound('beep'), 'beep');
assert.equal(clampSound('theremin'), 'wood'); // a set removed in a later version
assert.equal(clampVolume(140), 100);
assert.equal(clampVolume(-3), 0);
assert.equal(clampVolume(Number.NaN), 100); // never silence the metronome by accident
assert.equal(volumeGain(50), 0.5);

// --- compound meters ------------------------------------------------------
// isCompound decides where defaultAccents puts the group clicks, so a wrong
// answer is an audibly wrong bar rather than a cosmetic slip.
for (const sig of [{ beats: 6, denom: 8 }, { beats: 9, denom: 8 }, { beats: 12, denom: 8 }])
  assert.equal(isCompound(sig), true, `${sig.beats}/${sig.denom}`);
for (const sig of [
  { beats: 3, denom: 8 }, // three eighths pulse singly, not as one group
  { beats: 4, denom: 4 },
  { beats: 6, denom: 4 }, // groups of three only when the beat is an eighth
  { beats: 3, denom: 4 },
  { beats: 7, denom: 8 },
  { beats: 12, denom: 16 },
  { beats: 1, denom: 8 },
])
  assert.equal(isCompound(sig), false, `${sig.beats}/${sig.denom}`);

// and the accents it drives: 6/8 is ACCENT . . MID . .
assert.deepEqual(defaultAccents({ beats: 6, denom: 8 }), [ACCENT, PLAIN, PLAIN, MID, PLAIN, PLAIN]);
assert.deepEqual(defaultAccents({ beats: 3, denom: 8 }), [ACCENT, PLAIN, PLAIN], 'simple meter gets no group click');

// --- the JS clock: a late tick never doubles ---------------------------
// `pos` is already the position after the tick that just fired; `dueAt` is
// when that tick was meant to go. On time, the next one is simply a beat later.
assert.deepEqual(nextTick({ beats: 1, sub: 0 }, 10_000, 10_003, 500, 1), { beats: 1, sub: 0, nextAt: 10_500, dropped: 0 });

// a tick that fired 300 ms late at 120 BPM still has 200 ms of its successor's
// slot left: that click plays, on the grid — it is the late one that was wrong
assert.deepEqual(nextTick({ beats: 1, sub: 0 }, 10_000, 10_300, 500, 1), { beats: 1, sub: 0, nextAt: 10_500, dropped: 0 });
// 400 ms late, the successor would land 100 ms after it — the double click. Its
// slot is more than MIN_LEAD gone, so it is dropped and the beat after it plays
{
  const step = nextTick({ beats: 1, sub: 0 }, 10_000, 10_400, 500, 1);
  assert.equal(step.nextAt, 11_000, 'the next audible click stays on the grid');
  assert.equal(step.dropped, 1);
  assert.deepEqual([step.beats, step.sub], [2, 0], 'the dropped beat is counted, so the bar keeps its phase');
  assert.equal(accentLevel(step.beats, four), accentLevel(2, four));
}
// right at the edge: a slot with exactly MIN_LEAD of the interval left is still played
assert.equal(MIN_LEAD, 0.25);
assert.equal(nextTick({ beats: 1, sub: 0 }, 10_000, 10_375, 500, 1).dropped, 0);
assert.equal(nextTick({ beats: 1, sub: 0 }, 10_000, 10_376, 500, 1).dropped, 1);

// dropped ticks advance the subdivision count the same way played ones would:
// two sixteenths gone at 120 BPM lands on the third of the same beat
{
  const step = nextTick({ beats: 4, sub: 1 }, 10_000, 10_250, 125, 4);
  assert.equal(step.dropped, 2);
  assert.deepEqual([step.beats, step.sub], [4, 3]);
  assert.equal(step.nextAt, 10_375);
}

// a very late tick means the process slept: the grid restarts from now, with
// the count kept, instead of sprinting through the bar it missed
assert.equal(RESYNC_AFTER_MS, 500);
{
  const step = nextTick({ beats: 9, sub: 0 }, 10_000, 12_000, 500, 1);
  assert.deepEqual(step, { beats: 9, sub: 0, nextAt: 12_500, dropped: 0 });
}
// ...and just inside that window it still catches up on the grid
assert.deepEqual(nextTick({ beats: 9, sub: 0 }, 10_000, 10_850, 500, 1), { beats: 10, sub: 0, nextAt: 11_000, dropped: 1 });

// interval: 120 BPM is half a second a beat, and subdivisions divide it
assert.equal(tickInterval(120, 1), 500);
assert.equal(tickInterval(120, 4), 125);
assert.equal(tickInterval(120, 5), 500); // not a shipped subdivision - just the beat
assert.equal(tickInterval(0, 1), 3000); // clamped to 20 BPM rather than dividing by zero

console.log('metronome math ok');
