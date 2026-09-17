// Drone (Tools tab): the reference-pitch table has to land on the textbook
// frequencies, with A4 adjustable for orchestras that tune high.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

import { DRONE_NOTES, droneFreq, droneRate } from '../src/lib/drone.ts';

assert.equal(DRONE_NOTES.length, 12);
assert.equal(droneFreq('A', 4), 440);
assert.ok(Math.abs(droneFreq('C', 4) - 261.63) < 0.01);
assert.equal(droneFreq('A', 3), 220);
assert.ok(Math.abs(droneFreq('G#', 4) - 415.3) < 0.01);
assert.ok(Math.abs(droneFreq('A', 4, 442) - 442) < 1e-9);
assert.ok(Math.abs(droneFreq('E', 2) - 82.41) < 0.01, 'low E of a guitar');

// the shipped samples are all of octave 4; the octaves below and a shifted A4
// come from the playback rate — pitch correction off, so rate IS pitch
assert.equal(droneRate('A', 4, 440), 1, 'A4 is the sample itself');
assert.equal(droneRate('A', 3, 440), 0.5, 'an octave down is exactly half rate');
assert.equal(droneRate('A', 2, 440), 0.25);
assert.ok(Math.abs(droneRate('A', 4, 442) - 442 / 440) < 1e-9);
assert.ok(Math.abs(droneRate('C', 4, 440) - 1) < 1e-9, 'C4 is the sample itself too');

// --- sample layout --------------------------------------------------------
// All twelve samples are rendered in one scientific octave, so a note played
// at that octave uses its own sample untouched.
import { A4_MAX, A4_MIN, DRONE_OCTAVES, droneFile, MAX_RATE, MIN_RATE, SAMPLE_OCTAVE } from '../src/lib/drone.ts';
assert.equal(SAMPLE_OCTAVE, Math.max(...DRONE_OCTAVES), 'samples must sit in the TOP octave offered, so every rate is a pitch down');
for (const n of DRONE_NOTES) assert.equal(droneRate(n, SAMPLE_OCTAVE, 440), 1, `${n} plays its own sample untouched`);

// Every note/octave/A4 the picker offers has to land inside expo-audio's rate
// window (0.1..2 on Android, 0.0..2 on iOS), or the drone plays at the wrong
// pitch instead of refusing. Rendering the samples an octave low used to push
// A4/A#4/B4 above concert pitch past the ceiling.
const A4S = [A4_MIN, 440, A4_MAX];
const offered = DRONE_NOTES.flatMap((n) => DRONE_OCTAVES.flatMap((oct) => A4S.map((a4) => ({ n, oct, a4, r: droneRate(n, oct, a4) }))));
assert.equal(offered.length, 108);
for (const c of offered)
  assert.ok(c.r >= MIN_RATE && c.r <= MAX_RATE, `${c.n}${c.oct} @A${c.a4} rate ${c.r} outside ${MIN_RATE}..${MAX_RATE}`);

// and not merely inside it — comfortably so, with the ceiling never approached
const rates = offered.map((c) => c.r);
assert.ok(Math.max(...rates) <= 1.05, `top rate ${Math.max(...rates)} should stay near 1, not near the ceiling`);
assert.ok(Math.min(...rates) >= 0.2, `bottom rate ${Math.min(...rates)} drops further than three octaves`);

// every note is reachable at every offered octave — no silent holes in the picker
assert.equal(new Set(offered.map((c) => `${c.n}${c.oct}`)).size, DRONE_NOTES.length * DRONE_OCTAVES.length);

// raw resource names must be [a-z0-9_] for Android
const files = DRONE_NOTES.map(droneFile);
for (const f of files) assert.match(f, /^[a-z0-9_]+$/, f);
assert.equal(new Set(files).size, DRONE_NOTES.length, 'one distinct file per note');
assert.equal(droneFile('G#'), 'drone_gs');
assert.equal(droneFile('A'), 'drone_a');

// --- the shipped samples themselves ---------------------------------------
// Everything above is arithmetic over SAMPLE_OCTAVE. This is the one thing that
// checks the .wav files actually agree with it: the bug this replaced was the
// sample set drifting out of step with the maths, which no amount of pure-
// function testing could see.
const fundamentalHz = (file: string): number => {
  const b = readFileSync(file);
  // minimal RIFF walk — the generator writes 16-bit mono PCM
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${file} is not a RIFF file`);
  let off = 12;
  let rate = 0;
  let data: Buffer | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      assert.equal(b.readUInt16LE(off + 10), 1, `${file} must be mono`);
      assert.equal(b.readUInt16LE(off + 22), 16, `${file} must be 16-bit`);
      rate = b.readUInt32LE(off + 12);
    } else if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  assert.ok(rate && data, `${file} has no fmt/data chunk`);
  // positive-going zero crossings over whole cycles — enough for a tone whose
  // partials are integer multiples and never cross zero on their own
  const n = data.length / 2;
  const at = (i: number) => data.readInt16LE(i * 2);
  const cross: number[] = [];
  for (let i = 1; i < n; i++) if (at(i - 1) < 0 && at(i) >= 0) cross.push(i);
  assert.ok(cross.length > 2, `${file}: no periodic signal found`);
  return ((cross.length - 1) * rate) / (cross[cross.length - 1] - cross[0]);
};

for (const n of DRONE_NOTES) {
  const want = droneFreq(n, SAMPLE_OCTAVE, 440);
  const got = fundamentalHz(`assets/audio/${droneFile(n)}.wav`);
  const cents = 1200 * Math.log2(got / want);
  // a cent is roughly the threshold of perception; the renderer lands far inside it
  assert.ok(Math.abs(cents) < 1, `${droneFile(n)}.wav is ${cents.toFixed(2)} cents off ${want.toFixed(2)} Hz — re-run scripts/make-drone.py`);
}

console.log('check-drone ok');
