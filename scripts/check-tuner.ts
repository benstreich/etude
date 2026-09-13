// Tuner math: note conversion, instrument string targets, YIN pitch detection.
// Synthesized waveforms in, expected notes out — no device needed.
import assert from 'node:assert';

import {
  bytesToSamples,
  detectPitch,
  INSTRUMENTS,
  midiToHz,
  nearestString,
  smooth,
  toNote,
  WINDOW,
} from '../src/lib/tuner-math.ts';

const near = (a: number, b: number, eps: number, msg: string) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (±${eps})`);

// --- toNote ---
const a4 = toNote(440);
assert.equal(a4.name, 'A');
assert.equal(a4.octave, 4);
assert.equal(a4.midi, 69);
near(a4.cents, 0, 0.01, 'A440 cents');

assert.equal(toNote(466.164).name, 'A#'); // sharps only, no flat spellings
assert.equal(toNote(261.626).name, 'C');
assert.equal(toNote(261.626).octave, 4); // middle C is C4
assert.equal(toNote(220).octave, 3);
assert.equal(toNote(880).octave, 5);

// 442 is 7.85 cents sharp of A440
near(toNote(442).cents, 7.85, 0.05, '442 cents');
near(toNote(438).cents, -7.89, 0.05, '438 cents');

// cents stay inside the half-semitone either side
assert.ok(Math.abs(toNote(453).cents) <= 50);
assert.ok(Math.abs(toNote(428).cents) <= 50);

// reference A moves the whole grid
const baroque = toNote(415, 415);
assert.equal(baroque.name, 'A');
assert.equal(baroque.midi, 69);
near(baroque.cents, 0, 0.01, 'A415 at refA=415');
// 440 against an A415 grid is a little over a semitone sharp — so it reads as
// A#4, a couple of cents flat of it
const shifted = toNote(440, 415);
assert.equal(shifted.name, 'A#');
near(shifted.cents, 1200 * Math.log2(440 / 415) - 100, 0.05, '440 against A415');

// --- instruments ---
const ids = INSTRUMENTS.map((i) => i.id);
for (const want of ['chromatic', 'guitar', 'bass', 'violin', 'viola', 'cello', 'ukulele'])
  assert.ok(ids.includes(want), `instrument ${want}`);
const inst = (id: string) => INSTRUMENTS.find((i) => i.id === id)!;
assert.deepEqual(inst('chromatic').strings, []);
assert.deepEqual(inst('guitar').strings, [40, 45, 50, 55, 59, 64]);
assert.deepEqual(inst('violin').strings, [55, 62, 69, 76]);
assert.deepEqual(inst('bass').strings, [28, 33, 38, 43]);

// every open string round-trips through hz and back to its own midi number
for (const i of INSTRUMENTS)
  for (const [idx, midi] of i.strings.entries()) {
    const n = toNote(midiToHz(midi));
    assert.equal(n.midi, midi, `${i.id} string ${idx}`);
    near(n.cents, 0, 0.01, `${i.id} string ${idx} cents`);
    assert.equal(nearestString(midi, i.strings), idx, `${i.id} nearestString ${idx}`);
  }

// nearestString picks the closest, and gives up past 3 semitones
const guitar = inst('guitar').strings;
assert.equal(nearestString(41, guitar), 0); // 1 semitone above low E
assert.equal(nearestString(44, guitar), 1); // closer to A2 than to E2
assert.equal(nearestString(68, guitar), 5); // 4 above high E — still nearest, but
assert.equal(nearestString(20, guitar), null); // 8 below low E — out of range
assert.equal(nearestString(60, []), null);

// --- detectPitch ---
const RATE = 44100;

/** A tone with `harmonics` partials at 1/n amplitude — 1 is a pure sine, 8 is sawtooth-ish. */
function tone(hz: number, harmonics = 1, amp = 0.5): Float32Array {
  const buf = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin((2 * Math.PI * hz * h * i) / RATE) / h;
    buf[i] = v * amp;
  }
  return buf;
}

const centsOff = (got: number, want: number) => 1200 * Math.log2(got / want);

for (const hz of [41.2, 82.4, 110, 196, 220, 440, 442]) {
  const p = detectPitch(tone(hz), RATE);
  assert.ok(p, `detect ${hz} Hz`);
  near(centsOff(p!.hz, hz), 0, 2, `${hz} Hz within 2 cents`);
}

// The decimate-by-4 assumption lives or dies here. If these fail, set DECIMATION = 2.
for (const hz of [659.26, 880]) {
  const p = detectPitch(tone(hz), RATE);
  assert.ok(p, `detect ${hz} Hz`);
  near(centsOff(p!.hz, hz), 0, 2, `${hz} Hz within 2 cents (decimation guard)`);
}

// harmonics must not fool it into the octave above
const saw = detectPitch(tone(196, 8), RATE);
assert.ok(saw, 'detect sawtooth');
near(centsOff(saw!.hz, 196), 0, 2, 'sawtooth G3 fundamental, not a harmonic');
assert.equal(toNote(saw!.hz).name, 'G');
assert.equal(toNote(saw!.hz).octave, 3);

// --- rejection: anything that isn't a note reads as silence, not a wandering needle ---
const noise = new Float32Array(WINDOW);
let seed = 12345;
for (let i = 0; i < WINDOW; i++) {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic, so this test can't flake
  noise[i] = seed / 0x3fffffff - 1;
}
assert.equal(detectPitch(noise, RATE), null, 'white noise rejected');
assert.equal(detectPitch(new Float32Array(WINDOW), RATE), null, 'silence rejected');
assert.equal(detectPitch(tone(440, 1, 0.0005), RATE), null, 'near-silent tone rejected');
assert.equal(detectPitch(tone(20), RATE), null, 'below MIN_HZ rejected');

// --- smooth: median, so one octave error is discarded rather than averaged in ---
assert.equal(smooth([440, 441, 880, 439, 440]), 440);
assert.equal(smooth([440]), 440);
assert.equal(smooth([]), 0);
assert.equal(smooth([440, 442]), 441); // even length averages the middle pair

// --- the byte layout is a contract between Kotlin, Swift and JS ---
const pcm = new Int16Array([0, 32767, -32768, 16384]);
const back = bytesToSamples(new Uint8Array(pcm.buffer.slice(0)));
assert.equal(back.length, 4);
near(back[0], 0, 1e-6, 'zero sample');
near(back[1], 1, 1e-4, 'positive full scale');
near(back[2], -1, 1e-6, 'negative full scale');
near(back[3], 0.5, 1e-6, 'half scale');

console.log('tuner ok');
