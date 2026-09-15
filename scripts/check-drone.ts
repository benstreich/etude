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
console.log('check-drone ok');
