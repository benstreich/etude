// Silence detection (#88): where the music starts and stops, and — more often —
// when to leave the take alone. Every "return null" branch is worth more than the
// happy path here: a wrong auto-trim hides audio the player can't see is missing.
import assert from 'node:assert';

import {
  detectSilence,
  FLOOR_MIN,
  FLOOR_RATIO,
  MIN_SAVING_SEC,
  noiseFloor,
  PAD_SEC,
} from '../src/lib/silence-math.ts';
import { MIN_CLIP } from '../src/lib/trim-math.ts';

const close = (a: number, b: number, eps: number, what: string) =>
  assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} not within ${eps} of ${b}`);

// The recorder clamps silence to LEVEL_FLOOR (0.05, motifs.tsx), never to zero —
// so that, not 0, is what "quiet" looks like in every fixture below.
const QUIET = 0.05;
/** `n` samples: QUIET everywhere except [from, to), which is full level. */
const take = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => (i >= from && i < to ? 1 : QUIET));

// the floor is a share of the peak, with a hard minimum for a take with no peak at all
assert.equal(noiseFloor(1), FLOOR_RATIO);
assert.equal(noiseFloor(0), FLOOR_MIN);
assert.equal(noiseFloor(0.1), FLOOR_MIN); // ratio would fall under the minimum

// nothing to work with
assert.equal(detectSilence([], 10), null);
assert.equal(detectSilence(Array(60).fill(0), 10), null, 'flat zero is not music');
assert.equal(detectSilence(Array(60).fill(QUIET), 10), null, 'an all-silence take is kept whole');

// 2s silence + 10s music + 3s silence, at the stored 60-bar resolution.
// Buckets are 0.25s, so the boundaries land within one bucket of the true edges.
{
  const bucket = 15 / 60;
  const t = detectSilence(take(60, 8, 48), 15);
  assert.ok(t, 'music between silences should trim');
  close(t.start, 2 - PAD_SEC, bucket, 'start');
  close(t.end, 12 + PAD_SEC, bucket, 'end');
}

// loud from the first sample to the last: nothing to save
assert.equal(detectSilence(take(20, 0, 20), 10), null);

// savings just under the threshold: one quiet bucket of 0.25s leaves 0.075s to cut
{
  const t = detectSilence(take(40, 1, 40), 10);
  assert.equal(t, null, 'a fraction of a second is not worth trimming');
}
// ...and the same shape with enough dead air does trim, so the case above is a
// threshold test and not an accident of the fixture
assert.ok(detectSilence(take(40, 4, 40), 10), 'a second of lead-in is worth trimming');

// music too short to be a clip once padded: the pad is clamped by the file start
{
  const t = detectSilence(take(100, 0, 1), 10);
  assert.equal(t, null, `padded clip under MIN_CLIP (${MIN_CLIP}s) is not a trim`);
}

// a single spike mid-silence is padded on both sides and survives MIN_CLIP
{
  const t = detectSilence(take(100, 50, 51), 10);
  assert.ok(t);
  close(t.start, 5.05 - PAD_SEC, 1e-9, 'spike start');
  close(t.end, 5.05 + PAD_SEC, 1e-9, 'spike end');
  assert.ok(t.end - t.start >= MIN_CLIP);
}

// the pads never push a bound outside the file, wherever the music sits
for (let n = 4; n <= 120; n += 7)
  for (let from = 0; from < n; from += 3) {
    const dur = 12;
    const t = detectSilence(take(n, from, Math.min(n, from + 3)), dur);
    if (!t) continue;
    assert.ok(t.start >= 0, `negative start at n=${n} from=${from}: ${t.start}`);
    assert.ok(t.end <= dur, `end past the file at n=${n} from=${from}: ${t.end}`);
    assert.ok(t.end - t.start >= MIN_CLIP, `clip under MIN_CLIP at n=${n} from=${from}`);
    assert.ok(
      t.start + (dur - t.end) >= MIN_SAVING_SEC,
      `trimmed less than MIN_SAVING_SEC at n=${n} from=${from}`
    );
  }

// a zero-length or negative duration is never divided by
assert.equal(detectSilence(take(60, 8, 48), 0), null);
assert.equal(detectSilence(take(60, 8, 48), -5), null);

console.log('silence ok');
