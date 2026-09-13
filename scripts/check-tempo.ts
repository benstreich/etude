// Band edges for tempoTerm() — the bands must tile the range with no gap or overlap.
import assert from 'node:assert';

import { barlines, tempoTerm } from '../src/lib/tempo.ts';

for (const [bpm, want] of [
  [1, 'Adagio'], [75, 'Adagio'],
  [76, 'Andante'], [84, 'Andante'], [89, 'Andante'],
  [90, 'Moderato'], [107, 'Moderato'],
  [108, 'Allegretto'], [119, 'Allegretto'],
  [120, 'Allegro'], [300, 'Allegro'],
] as [number, string][])
  assert.equal(tempoTerm(bpm), want, `${bpm} BPM`);

// barlines: one at the start, one per boundary, none at the end (double barline)
assert.deepEqual(barlines([5, 10, 20]), [0, 5 / 35, 15 / 35]);
assert.deepEqual(barlines([10]), [0]); // single segment — start only
assert.deepEqual(barlines([]), [0]);
assert.deepEqual(barlines([0, 0]), [0]); // no division by zero
assert.ok(barlines([1, 1, 1, 1]).every((f) => f >= 0 && f < 1));

console.log('tempo ok');
