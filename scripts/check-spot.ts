// Trouble-spot stats (#91): totals, last practised, and the 14-day trend.
// Run: npm run check:spot
import assert from 'node:assert/strict';

import { spotStats, TREND_DOWN, TREND_UP } from '../src/lib/spot-math.ts';

const today = '2026-09-22';
const sess = (date: string, min: number, spot?: string, title = 'Für Elise') => ({ title, date, min, spot });

// --- nothing logged ---
assert.deepEqual(spotStats([], 'Für Elise', 'a', today), { min: 0, last: null, trend: 'flat' });

// --- only this piece's sessions on this spot count ---
{
  const list = [
    sess('2026-09-20', 10, 'a'),
    sess('2026-09-19', 20, 'b'), // another spot
    sess('2026-09-18', 30), // whole piece, no spot
    sess('2026-09-17', 40, 'a', 'Clair de Lune'), // same spot id on another piece
  ];
  const st = spotStats(list, 'Für Elise', 'a', today);
  assert.equal(st.min, 10);
  assert.equal(st.last, '2026-09-20');
}

// --- `last` is the latest date, whatever order the sessions arrive in ---
{
  const list = [sess('2026-09-01', 5, 'a'), sess('2026-09-15', 5, 'a'), sess('2026-09-10', 5, 'a')];
  assert.equal(spotStats(list, 'Für Elise', 'a', today).last, '2026-09-15');
  assert.equal(spotStats(list, 'Für Elise', 'a', today).min, 15);
}

// --- trend windows: last 14 days (Sep 9–22) vs the 14 before (Aug 26 – Sep 8) ---
const recentDay = '2026-09-15';
const beforeDay = '2026-09-01';

// exactly 1.25× is up; a hair under is flat
assert.equal(spotStats([sess(beforeDay, 40, 'a'), sess(recentDay, 50, 'a')], 'Für Elise', 'a', today).trend, 'up');
assert.equal(spotStats([sess(beforeDay, 40, 'a'), sess(recentDay, 49, 'a')], 'Für Elise', 'a', today).trend, 'flat');
assert.equal(50 / 40, TREND_UP);

// exactly 0.75× is down; a hair over is flat
assert.equal(spotStats([sess(beforeDay, 40, 'a'), sess(recentDay, 30, 'a')], 'Für Elise', 'a', today).trend, 'down');
assert.equal(spotStats([sess(beforeDay, 40, 'a'), sess(recentDay, 31, 'a')], 'Für Elise', 'a', today).trend, 'flat');
assert.equal(30 / 40, TREND_DOWN);

// nothing before, something now → up; something before, nothing now → down
assert.equal(spotStats([sess(recentDay, 10, 'a')], 'Für Elise', 'a', today).trend, 'up');
assert.equal(spotStats([sess(beforeDay, 10, 'a')], 'Für Elise', 'a', today).trend, 'down');

// both windows empty → flat, even with older history
assert.equal(spotStats([sess('2026-07-01', 90, 'a')], 'Für Elise', 'a', today).trend, 'flat');

// window edges: Sep 9 is the first recent day, Sep 8 the last of the window before, Aug 25 falls out
{
  assert.equal(spotStats([sess('2026-09-09', 10, 'a')], 'Für Elise', 'a', today).trend, 'up');
  assert.equal(spotStats([sess('2026-09-08', 10, 'a')], 'Für Elise', 'a', today).trend, 'down');
  const st = spotStats([sess('2026-08-25', 10, 'a')], 'Für Elise', 'a', today);
  assert.equal(st.trend, 'flat');
  assert.equal(st.min, 10, 'outside the trend windows still counts towards the total');
}

console.log('spot ok');
