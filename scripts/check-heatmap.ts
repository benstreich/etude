// Self-check for the pure heatmap math. Run: npm run check:heatmap
import assert from 'node:assert/strict';

import { heatLevel, mix, monthGrid } from '../src/lib/heatmap-math.ts';

// Aug 2026 starts on a Saturday and has 31 days
let weeks = monthGrid(2026, 7, true); // Monday start → 5 leading blanks
assert.equal(weeks[0].filter((d) => d === null).length, 5);
assert.equal(weeks[0][5], 1);
assert.equal(weeks.at(-1)!.filter((d) => d !== null).length, 1); // 31st alone in the last row
assert.ok(weeks.every((w) => w.length === 7));
assert.equal(weeks.flat().filter((d) => d !== null).length, 31);

weeks = monthGrid(2026, 7, false); // Sunday start → 6 leading blanks
assert.equal(weeks[0].filter((d) => d === null).length, 6);
assert.equal(weeks[0][6], 1);

// Feb 2027 starts on a Monday: a Monday-start grid has no blanks at all
weeks = monthGrid(2027, 1, true);
assert.equal(weeks[0][0], 1);
assert.equal(weeks.flat().filter((d) => d === null).length, 0);
assert.equal(weeks.length, 4); // 28 days exactly

// documented level boundaries: 0 none · 1–24 light · 25–39 mid · 40+ full
assert.deepEqual([0, 1, 24, 25, 39, 40, 500].map(heatLevel), [0, 1, 1, 2, 2, 3, 3]);
assert.equal(heatLevel(-5), 0);

// mix endpoints and midpoint
assert.equal(mix('#000000', '#ffffff', 0), '#000000');
assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
assert.equal(mix('#ff0000', '#00ff00', 0.5), '#808000');

console.log('check-heatmap: all assertions passed');

// --- chart series (line/bar views of the heatmap card) ---------------------
import { chartSeries } from '../src/lib/heatmap-math.ts';

const mbd = { '2026-09-14': 30, '2026-09-13': 20, '2026-09-08': 45, '2026-08-30': 10 };
const week = chartSeries(mbd, '2026-09-14', '7d');
assert.equal(week.length, 7, '7d gives one point per day');
assert.equal(week[6].label, '2026-09-14', 'last point is today');
assert.equal(week[6].min, 30);
assert.equal(week[5].min, 20);
assert.equal(week[0].label, '2026-09-08', 'window starts six days back');
assert.equal(week[0].min, 45);
assert.equal(chartSeries(mbd, '2026-09-14', '30d').length, 30);
assert.equal(chartSeries({}, '2026-09-14', '30d').every((p) => p.min === 0), true, 'no data is a flat line, not a crash');

const all = chartSeries(mbd, '2026-09-14', 'all');
assert.equal(all.length, 3, 'three 7-day buckets cover 2026-08-30 to 2026-09-14');
assert.equal(all[2].min, 95, 'this week: 30 + 20 + 45');
assert.equal(all[0].min, 10, 'oldest bucket holds the lone August session');
assert.equal(chartSeries({}, '2026-09-14', 'all').length, 0, 'no practice, no series');
assert.ok(chartSeries({ '2020-01-01': 5, '2026-09-14': 5 }, '2026-09-14', 'all').length <= 52, 'long histories are capped');
console.log('check-heatmap: chart series passed');
