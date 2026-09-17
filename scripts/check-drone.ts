// Drone (Tools tab): the reference-pitch table has to land on the textbook
// frequencies, with A4 adjustable for orchestras that tune high.
import assert from 'node:assert';

import { DRONE_NOTES, droneFreq, droneRate } from '../src/lib/drone.ts';

assert.equal(DRONE_NOTES.length, 12);
assert.equal(droneFreq('A', 4), 440);
assert.ok(Math.abs(droneFreq('C', 4) - 261.63) < 0.01);
assert.equal(droneFreq('A', 3), 220);
assert.ok(Math.abs(droneFreq('G#', 4) - 415.3) < 0.01);
assert.ok(Math.abs(droneFreq('A', 4, 442) - 442) < 1e-9);
assert.ok(Math.abs(droneFreq('E', 2) - 82.41) < 0.01, 'low E of a guitar');

// the shipped samples cover one octave (A3..G#4); other octaves and a shifted
// A4 come from the playback rate — pitch correction off, so rate IS pitch
assert.equal(droneRate('A', 4, 440), 2);
assert.equal(droneRate('A', 3, 440), 1);
assert.equal(droneRate('A', 2, 440), 0.5);
assert.ok(Math.abs(droneRate('A', 3, 442) - 442 / 440) < 1e-9);
assert.ok(Math.abs(droneRate('C', 4, 440) - 1) < 1e-9, 'C4 sits inside the sampled octave');

// --- sample layout --------------------------------------------------------
// The twelve shipped samples run A3..G#4, so the octave flips at C, not at A.
import { A4_MAX, A4_MIN, DRONE_OCTAVES, droneFile, MAX_RATE, MIN_RATE, SAMPLE_OCTAVE, sampleOctaveOf } from '../src/lib/drone.ts';
assert.equal(sampleOctaveOf('A'), SAMPLE_OCTAVE);
assert.equal(sampleOctaveOf('B'), SAMPLE_OCTAVE);
assert.equal(sampleOctaveOf('C'), SAMPLE_OCTAVE + 1, 'C belongs to the next scientific octave');
assert.equal(sampleOctaveOf('G#'), SAMPLE_OCTAVE + 1);
for (const n of DRONE_NOTES) assert.equal(droneRate(n, sampleOctaveOf(n), 440), 1, `${n} plays its own sample untouched`);

// Every note/octave/A4 the picker offers should land inside expo-audio's rate
// window, or the drone plays at the wrong pitch instead of refusing.
//
// KNOWN GAP: 42 of the 108 offered combinations do not. The twelve samples run
// A3..G#4, so C..G# sit an octave above A..B — at octave 2 they ask for 0.25,
// half the floor. The A4 stepper widens it at both ends: below 440 the low
// octaves slip under 0.5, above 440 A4/A#4/B4 push past 2.
//
// Pinned by shape rather than asserted away, so this check goes red both if the
// gap widens and when it is fixed. Whoever fixes it deletes this block.
const A4S = [A4_MIN, 440, A4_MAX];
const inWindow = (r: number) => r >= MIN_RATE && r <= MAX_RATE;
const offered = DRONE_NOTES.flatMap((n) => DRONE_OCTAVES.flatMap((oct) => A4S.map((a4) => ({ n, oct, a4, r: droneRate(n, oct, a4) }))));
const outside = offered.filter((c) => !inWindow(c.r));

assert.equal(offered.length, 108);
assert.equal(outside.length, 42, 'the gap changed size — re-read the block above before touching this number');

// at concert pitch only the octave-2 samples that sit an octave high are wrong
assert.deepEqual(
  offered.filter((c) => c.a4 === 440 && !inWindow(c.r)).map((c) => `${c.n}${c.oct}`).sort(),
  DRONE_NOTES.filter((n) => sampleOctaveOf(n) === SAMPLE_OCTAVE + 1).map((n) => `${n}2`).sort()
);
for (const c of offered.filter((c) => c.a4 === 440 && !inWindow(c.r))) assert.ok(Math.abs(c.r - 0.25) < 1e-12, `${c.n}2 asks for a quarter-rate, got ${c.r}`);

// away from 440 the failures are only at the extremes of each octave, never in the middle
assert.ok(outside.every((c) => c.oct === 2 || c.a4 !== 440), 'octaves 3 and 4 are correct at concert pitch');
assert.ok(offered.filter((c) => c.oct === 3 && c.a4 === 440).every((c) => inWindow(c.r)), 'the sampled octave always plays clean');
assert.ok(inWindow(droneRate('A', 4, 440)) && !inWindow(droneRate('A', 4, A4_MAX)), 'A4 clips past the ceiling only above concert pitch');

// raw resource names must be [a-z0-9_] for Android
const files = DRONE_NOTES.map(droneFile);
for (const f of files) assert.match(f, /^[a-z0-9_]+$/, f);
assert.equal(new Set(files).size, DRONE_NOTES.length, 'one distinct file per note');
assert.equal(droneFile('G#'), 'drone_gs');
assert.equal(droneFile('A'), 'drone_a');

console.log('check-drone ok');
