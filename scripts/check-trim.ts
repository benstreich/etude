// Trim handles: nearer handle wins, bounds stay inside the file and never cross.
import assert from 'node:assert';

import {
  clearTrim,
  dragHandle,
  dragTrim,
  inPoint,
  isTrimmed,
  nearestHandle,
  nudgeTrim,
  outPoint,
  setFromPlayhead,
  setHandle,
  timeAt,
} from '../src/lib/trim-math.ts';

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

// a named handle moves even when the finger is nearer the other one
assert.deepEqual(dragHandle({ sec: 100, start: 10, end: 90 }, 'start', 88, 100), { start: 88, end: 90 });
assert.deepEqual(dragHandle({ sec: 100, start: 10, end: 90 }, 'end', 12, 100), { start: 10, end: 12 });
assert.equal(nearestHandle({ sec: 100, start: 10, end: 90 }, 12, 100), 'start');
assert.equal(nearestHandle({ sec: 100, start: 10, end: 90 }, 88, 100), 'end');

// nudging is MIN_CLIP-safe in both directions and at both ends of the file
assert.deepEqual(nudgeTrim({ sec: 100, start: 10, end: 90 }, 'start', 1), { start: 10.1, end: 90 });
assert.deepEqual(nudgeTrim({ sec: 100, start: 10, end: 90 }, 'end', -1), { start: 10, end: 89.9 });
assert.deepEqual(nudgeTrim({ sec: 100, start: 0, end: 90 }, 'start', -1), { start: 0, end: 90 }); // floor
assert.deepEqual(nudgeTrim({ sec: 100, start: 10 }, 'end', 1), { start: 10, end: 100 }); // ceiling
assert.deepEqual(nudgeTrim({ sec: 100, start: 10, end: 10.5 }, 'start', 1), { start: 10, end: 10.5 }); // would cross
assert.deepEqual(nudgeTrim({ sec: 100, start: 10, end: 10.5 }, 'end', -1), { start: 10, end: 10.5 }); // would cross

// trimming by ear: the playhead sets a bound, under the same rules
assert.deepEqual(setFromPlayhead({ sec: 100, start: 10, end: 90 }, 'end', 42.5), { start: 10, end: 42.5 });
assert.deepEqual(setFromPlayhead({ sec: 100, start: 10, end: 90 }, 'start', 95), { start: 89.5, end: 90 }); // clamped to MIN_CLIP
assert.deepEqual(setHandle({ sec: 100 }, 'end', 0), { start: 0, end: 0.5 });

assert.deepEqual(clearTrim(), { start: undefined, end: undefined });

// an untrimmed take reads as the whole file; a trimmed one says so
assert.equal(inPoint({ sec: 100 }), 0);
assert.equal(outPoint({ sec: 100 }), 100);
assert.equal(isTrimmed({ sec: 100 }), false);
assert.equal(inPoint({ sec: 100, start: 12 }), 12);
assert.equal(outPoint({ sec: 100, end: 88 }), 88);
assert.equal(isTrimmed({ sec: 100, start: 12 }), true);
assert.equal(isTrimmed({ sec: 100, end: 88 }), true);

// pixels to seconds, clamped to the file at both ends
assert.equal(timeAt({ sec: 100 }, 50, 100), 50);
assert.equal(timeAt({ sec: 100 }, -10, 100), 0);
assert.equal(timeAt({ sec: 100 }, 250, 100), 100);
assert.equal(timeAt({ sec: 100 }, 10, 0), 100); // zero width never divides by zero

console.log('trim ok');
