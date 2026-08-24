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
