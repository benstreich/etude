// Self-check for the pure streak math. Run: npm run check:streak
import assert from 'node:assert/strict';

import { computeBestStreak, computeStreak, dateKey, graceFor } from '../src/lib/streak-math.ts';

// build a minutesByDate from offsets (days ago) that practiced
const history = (...daysAgo: number[]) => {
  const m: Record<string, number> = {};
  for (const n of daysAgo) {
    const d = new Date(2026, 7, 19); // Wed Aug 19 2026
    d.setDate(d.getDate() - n);
    m[dateKey(d)] = 30;
  }
  return m;
};
const today = new Date(2026, 7, 19);
const run = (m: Record<string, number>, breakDays: string[] = [], grace = 0) =>
  computeStreak(m, breakDays, grace, today);

// plain run counts, a 0-minute today doesn't break it
assert.equal(run(history(0, 1, 2)), 3);
assert.equal(run(history(1, 2, 3)), 3);

// strict: one missed day ends it
assert.equal(run(history(1, 3, 4)), 1);

// relaxed: one missed day per gap is forgiven (and doesn't count itself)
assert.equal(run(history(1, 3, 4), [], 1), 3);
assert.equal(run(history(1, 4, 5), [], 1), 1); // two missed days still break

// grace resets per gap: two separate one-day holes both survive
assert.equal(run(history(1, 3, 5), [], 1), 3);

// unpracticed break day is skipped and consumes no grace
// Aug 16 2026 is a Sunday; practiced Mon..today except Sunday
assert.equal(run(history(0, 1, 2, 4), ['Sunday']), 4);

// practiced break day extends the streak
assert.equal(run(history(0, 1, 2, 3, 4), ['Sunday']), 5);

// backdating a past day revives the streak (derived from history)
const revived = { ...history(0, 3, 4), ...history(1, 2) };
assert.equal(run(revived), 5);

// mode → grace mapping
assert.equal(graceFor('strict'), 0);
assert.equal(graceFor('relaxed'), 1);
assert.equal(graceFor('off'), 0);

// best streak scans all of history: a backdated island beats the current run
assert.equal(computeBestStreak(history(0, 10, 11, 12), []), 3);
assert.equal(run(history(0, 10, 11, 12)), 1); // ...which the current streak doesn't see
// grace applies inside a past island too
assert.equal(computeBestStreak(history(10, 12), [], 1), 2);
// empty history
assert.equal(computeBestStreak({}, []), 0);

console.log('check-streak: all assertions passed');
