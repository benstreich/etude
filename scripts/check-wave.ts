// Saved waveform: averaged down to at most WAVE_BARS, and never NaN.
import assert from 'node:assert';

import { downsample, WAVE_BARS } from '../src/lib/wave-math.ts';

assert.deepEqual(downsample([]), []); // a take with no samples draws nothing
assert.deepEqual(downsample([0.5, 0.25]), [0.5, 0.25]); // shorter than the target is kept as-is
assert.deepEqual(downsample([0.111, 0.999]), [0.11, 1]); // rounded to 2dp

// a long take is averaged, not sliced: a ramp keeps its shape and its ends
const ramp = Array.from({ length: 600 }, (_, i) => i / 599);
const out = downsample(ramp);
assert.equal(out.length, WAVE_BARS);
assert.ok(out[0] < 0.05 && out[WAVE_BARS - 1] > 0.95, `ramp ends lost: ${out[0]}, ${out[WAVE_BARS - 1]}`);
for (let i = 1; i < out.length; i++) assert.ok(out[i] >= out[i - 1], `not monotonic at ${i}`);
for (const v of out) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `bad value ${v}`);

// every bar is covered even when the sample count isn't a multiple of the bar count
const odd = downsample(Array.from({ length: 61 }, () => 0.4));
assert.equal(odd.length, WAVE_BARS);
for (const v of odd) assert.equal(v, 0.4);

assert.equal(downsample(ramp, 1).length, 1);

console.log('wave ok');
