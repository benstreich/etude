// The repertoire bar must agree with the stage label on any number of stages.
import assert from 'node:assert';

import { stagePct } from '../src/lib/stage-math.ts';

assert.equal(stagePct(0, 3), 20); // first stage always reads the same sliver
assert.equal(stagePct(1, 3), 67);
assert.equal(stagePct(2, 3), 100); // last stage is "ready"
assert.equal(stagePct(1, 4), 50);
assert.equal(stagePct(3, 4), 100);
assert.equal(stagePct(9, 3), 100); // a dangling index from a shortened stage list
assert.equal(stagePct(-1, 3), 20);

// monotonic, bounded, and the last stage is always 100 — whatever the list length
for (let n = 2; n <= 8; n++) {
  let prev = 0;
  for (let stage = 0; stage < n; stage++) {
    const pct = stagePct(stage, n);
    assert.ok(pct >= prev, `stage ${stage}/${n} went backwards`);
    assert.ok(pct > 0 && pct <= 100, `stage ${stage}/${n} out of range: ${pct}`);
    prev = pct;
  }
  assert.equal(stagePct(n - 1, n), 100, `last of ${n} stages should read ready`);
}

console.log('stage ok');
