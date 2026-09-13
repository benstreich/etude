// Trim handles: nearer handle wins, bounds stay inside the file and never cross.
import assert from 'node:assert';

import { dragTrim } from '../src/lib/trim-math.ts';

const r = { sec: 100 };
assert.deepEqual(dragTrim(r, 10, 100), { start: 10, end: 100 }); // near the in point
assert.deepEqual(dragTrim(r, 90, 100), { start: 0, end: 90 }); // near the out point
assert.deepEqual(dragTrim(r, -50, 100), { start: 0, end: 100 }); // clamped left
assert.deepEqual(dragTrim({ sec: 100, start: 40 }, 200, 100), { start: 40, end: 100 }); // clamped right
// handles may not cross, whatever the drag: a 0.8s clip dragged anywhere keeps 0.5s
for (let x = -20; x <= 120; x++) {
  const t = dragTrim({ sec: 100, start: 0, end: 0.8 }, x, 100);
  assert.ok(t.end - t.start >= 0.5, `clip collapsed at x=${x}: ${JSON.stringify(t)}`);
  assert.ok(t.start >= 0 && t.end <= 100, `out of bounds at x=${x}: ${JSON.stringify(t)}`);
}
assert.deepEqual(dragTrim(r, 50, 0), { start: 0, end: 100 }); // zero width → no NaN

console.log('trim ok');
