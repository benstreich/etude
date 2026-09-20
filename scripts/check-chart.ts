// Axis math for the minutes chart: the top gridline must clear the data, the
// labels must fit the gutter, and the x ticks must always include both ends.
import assert from 'node:assert/strict';

import { CHART_TICKS, fmtAxis, niceMax, tickIndices } from '../src/lib/chart-math.ts';

// niceMax: tens of minutes up to 2h, whole hours above — and never below the data
assert.equal(niceMax(0), 10); // an empty chart still draws an axis
assert.equal(niceMax(1), 10);
assert.equal(niceMax(45), 50);
assert.equal(niceMax(50), 50); // already round stays put
assert.equal(niceMax(120), 120); // band edge: still tens
assert.equal(niceMax(121), 180); // past the edge: whole hours
assert.equal(niceMax(180), 180);
assert.equal(niceMax(181), 240);
for (const v of [0, 5, 45, 119, 120, 121, 240, 600]) assert.ok(niceMax(v) >= v, `axis top ${niceMax(v)} below data ${v}`);

// fmtAxis: minutes under an hour, hours above, halves kept to one decimal
assert.equal(fmtAxis(0), '0m');
assert.equal(fmtAxis(45), '45m');
assert.equal(fmtAxis(60), '1h');
assert.equal(fmtAxis(90), '1.5h');
assert.equal(fmtAxis(120), '2h');
assert.equal(fmtAxis(100), '1.7h'); // rounded, not truncated with trailing digits

// tickIndices: a week labels every day; longer ranges get CHART_TICKS labels,
// first and last always among them, strictly increasing (no doubled label)
assert.deepEqual(tickIndices(0), []);
assert.deepEqual(tickIndices(1), [0]);
assert.deepEqual(tickIndices(7), [0, 1, 2, 3, 4, 5, 6]);
for (const n of [8, 30, 31, 90, 365]) {
  const t = tickIndices(n);
  assert.equal(t.length, CHART_TICKS, `${n} points`);
  assert.equal(t[0], 0, `${n}: first point unlabelled`);
  assert.equal(t[t.length - 1], n - 1, `${n}: last point unlabelled`);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], `${n}: ticks not increasing at ${i}`);
}

console.log('chart ok');
