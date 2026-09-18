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
  handoffTick,
  resumeTick,
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

// --- handing the loop over, and taking it back ------------------------
// Backgrounding moves the click loop to the foreground service and coming
// back takes it again. Restarting instead of continuing is what doubled the
// click and reset the bar, so the phase is the thing to pin down.

// the service is told which tick is next and what is left of its wait
assert.deepEqual(handoffTick({ beats: 7, sub: 1, nextAt: 10_250 }, 10_000), { beat: 7, sub: 1, startIn: 250 });
// a tick already due fires at once instead of being scheduled in the past
assert.deepEqual(handoffTick({ beats: 7, sub: 1, nextAt: 10_250 }, 11_000), { beat: 7, sub: 1, startIn: 0 });
// the beat counter is absolute, not a position in the bar: beat 12 of 4/4 is
// still beat 12, or a bars-based ramp loses everything it had climbed
assert.equal(handoffTick({ beats: 12, sub: 0, nextAt: 1 }, 0).beat, 12);

// coming back, the service's position wins and the wait is what was left of it
assert.deepEqual(resumeTick({ beats: 7, sub: 1 }, { beat: 30, sub: 2, nextIn: 120 }, 500), {
  beats: 30,
  sub: 2,
  wait: 120,
});
// nothing ticked natively (iOS, Expo Go, a run that never left the foreground):
// the run keeps its own count and waits a whole interval
assert.deepEqual(resumeTick({ beats: 7, sub: 1 }, null, 500), { beats: 7, sub: 1, wait: 500 });
assert.deepEqual(resumeTick({ beats: 7, sub: 1 }, undefined, 500), { beats: 7, sub: 1, wait: 500 });
// a report that reached us late doesn't schedule the next tick in the past
assert.equal(resumeTick({ beats: 0, sub: 0 }, { beat: 3, sub: 0, nextIn: -40 }, 500).wait, 0);
// counters cross the bridge as doubles
assert.deepEqual(resumeTick({ beats: 0, sub: 0 }, { beat: 12.0, sub: 0.0, nextIn: 33.4 }, 500), {
  beats: 12,
  sub: 0,
  wait: 33.4,
});

// A round trip is the whole point: the tick that was next when the screen went
// off is the tick that plays when it comes back, at the moment it was due —
// not a fresh downbeat on top of the click JS had just played.
const handed = handoffTick({ beats: 5, sub: 0, nextAt: 1_000 }, 900);
const taken = resumeTick({ beats: 5, sub: 0 }, { ...handed, nextIn: handed.startIn }, 500);
assert.deepEqual(taken, { beats: 5, sub: 0, wait: 100 });
assert.equal(accentLevel(taken.beats, four), accentLevel(5, four), 'the bar plays the accent it was going to');

// the service counts on: three bars of 4/4 later the ramp still measures whole
// bars from the run's own zero
const later = resumeTick({ beats: 5, sub: 0 }, { beat: 17, sub: 0, nextIn: 0 }, 500);
assert.equal(Math.floor((later.beats - 5) / four.beats), 3);

// interval: 120 BPM is half a second a beat, and subdivisions divide it
assert.equal(tickInterval(120, 1), 500);
assert.equal(tickInterval(120, 4), 125);
assert.equal(tickInterval(120, 5), 500); // not a shipped subdivision - just the beat
assert.equal(tickInterval(0, 1), 3000); // clamped to 20 BPM rather than dividing by zero

console.log('metronome math ok');
