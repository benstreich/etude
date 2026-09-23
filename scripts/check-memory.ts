// Memorization mode (#94): the deterministic draw of hidden measures and the
// self-grade log. Run: npm run check:memory
import assert from 'node:assert/strict';

import { hiddenCount, hiddenMeasures, lastTest, MEMORY_FRACTIONS, memorySeed, recentTests, type MemoryFraction } from '../src/lib/memory-math.ts';

assert.deepEqual(MEMORY_FRACTIONS, [25, 50, 75]);

// --- how many ---
assert.equal(hiddenCount(8, 50), 4);
assert.equal(hiddenCount(8, 25), 2);
assert.equal(hiddenCount(8, 75), 6);
assert.equal(hiddenCount(2, 25), 1, 'at least one while there is anything');
assert.equal(hiddenCount(1, 25), 1);
assert.equal(hiddenCount(3, 50), 2, 'rounds half up');
assert.equal(hiddenCount(0, 50), 0);
assert.equal(hiddenCount(-3, 50), 0);
assert.equal(hiddenCount(33, 75), 25);

// --- the draw ---
const seed = memorySeed('piece-1', '2026-09-23', 0);
assert.equal(seed, 'piece-1|2026-09-23|0');
{
  const a = hiddenMeasures(seed, 8, 50);
  const b = hiddenMeasures(seed, 8, 50);
  assert.deepEqual(a, b, 'same seed, same set');
  assert.equal(a.length, 4, 'fraction 50 of 8 hides exactly 4');
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], 'strictly ascending');
  assert.ok(a.every((i) => i >= 0 && i < 8), 'all in range');
  assert.equal(new Set(a).size, a.length, 'no repeats');
}
assert.deepEqual(hiddenMeasures(seed, 2, 25), [expect1(seed, 2)], 'fraction 25 of 2 still hides one');
function expect1(s: string, count: number) {
  const r = hiddenMeasures(s, count, 25);
  assert.equal(r.length, 1);
  return r[0];
}
assert.deepEqual(hiddenMeasures(seed, 0, 50), []);
assert.deepEqual(hiddenMeasures(seed, 1, 75), [0]);
assert.equal(hiddenMeasures(seed, 3, 75).length, 2, '75% of three rounds to two');
assert.deepEqual(hiddenMeasures(seed, 1, 50), [0], 'one bar: the one bar');
{
  // a different salt is a different set (for a score long enough that a collision is unlikely)
  const sets = [0, 1, 2, 3, 4].map((salt) => hiddenMeasures(memorySeed('piece-1', '2026-09-23', salt), 16, 50).join(','));
  assert.ok(new Set(sets).size >= 4, `reshuffles barely differ: ${sets.join(' | ')}`);
  // a different day or piece too
  assert.notEqual(hiddenMeasures(memorySeed('piece-1', '2026-09-24', 0), 16, 50).join(), hiddenMeasures(seed, 16, 50).join());
  assert.notEqual(hiddenMeasures(memorySeed('piece-2', '2026-09-23', 0), 16, 50).join(), hiddenMeasures(seed, 16, 50).join());
}
{
  // changing the fraction keeps the day's draw: the 25% set is a subset of the 50% set, which is a subset of the 75% one
  const s25 = hiddenMeasures(seed, 16, 25);
  const s50 = hiddenMeasures(seed, 16, 50);
  const s75 = hiddenMeasures(seed, 16, 75);
  assert.deepEqual([s25.length, s50.length, s75.length], [4, 8, 12]);
  assert.ok(s25.every((i) => s50.includes(i)), 'a quarter is inside the half');
  assert.ok(s50.every((i) => s75.includes(i)), 'the half is inside three quarters');
}
{
  // the draw is spread, not clustered: over many seeds every measure gets hidden sometimes
  const hits = new Array(10).fill(0);
  for (let salt = 0; salt < 200; salt++) for (const i of hiddenMeasures(memorySeed('p', '2026-01-01', salt), 10, 50)) hits[i] += 1;
  assert.ok(hits.every((h) => h > 50 && h < 150), `uneven draw: ${hits.join(',')}`);
}
for (const f of MEMORY_FRACTIONS as MemoryFraction[]) assert.equal(hiddenMeasures(seed, 40, f).length, hiddenCount(40, f));

// --- the log ---
assert.equal(lastTest(undefined), null);
assert.equal(lastTest([]), null);
{
  const log = [
    { date: '2026-09-10', score: 0 as const, fraction: 50 as const },
    { date: '2026-09-22', score: 2 as const, fraction: 75 as const },
    { date: '2026-09-15', score: 1 as const, fraction: 25 as const },
  ];
  assert.deepEqual(lastTest(log), log[1], 'the latest date, whatever the order');
  // two tests the same day: the one logged later wins
  const twice = [...log, { date: '2026-09-22', score: 0 as const, fraction: 50 as const }];
  assert.equal(lastTest(twice)!.score, 0);
  assert.deepEqual(recentTests(log).map((e) => e.date), ['2026-09-10', '2026-09-15', '2026-09-22']);
  assert.deepEqual(recentTests(log, 2).map((e) => e.date), ['2026-09-15', '2026-09-22']);
  assert.deepEqual(recentTests(undefined), []);
  const many = Array.from({ length: 20 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, score: 1 as const }));
  assert.equal(recentTests(many).length, 14);
  assert.equal(recentTests(many)[13].date, '2026-08-20');
}

console.log('check-memory: all assertions passed');
