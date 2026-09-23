// The monthly challenge (#105): data floor, kind rotation, targets nudged from
// last month, clamps, and the met boundary. Run: npm run check:challenge
import assert from 'node:assert/strict';

import {
  CHALLENGE_FLOOR_DAYS,
  challengeJustMet,
  challengeKind,
  DAYS_MIN,
  KINDS,
  MINUTES_MIN,
  monthlyChallenge,
  RESTART_GOALS,
  type ChallengeOpts,
} from '../src/lib/challenge-math.ts';

/** `n` practised days of `min` minutes spread over a month, from the 1st. */
const month = (ym: string, n: number, min = 30, start = 1): Record<string, number> => {
  const out: Record<string, number> = {};
  for (let d = 0; d < n; d++) out[`${ym}-${String(start + d).padStart(2, '0')}`] = min;
  return out;
};
const opts = (o: Partial<ChallengeOpts>): ChallengeOpts => ({ todayKey: '2026-09-22', minutesByDate: {}, dailyGoal: 30, breakDays: [], weekStart: 'Monday', ...o });

// --- data floor ---
// history is what came before this month; the month itself never counts towards its own floor
assert.equal(CHALLENGE_FLOOR_DAYS, 14);
assert.equal(monthlyChallenge(opts({ minutesByDate: month('2026-08', 13) })), null);
assert.equal(monthlyChallenge(opts({ minutesByDate: { ...month('2026-08', 13), ...month('2026-09', 10) } })), null, 'this month does not count');
assert.ok(monthlyChallenge(opts({ minutesByDate: month('2026-08', 14) })), 'exactly at the floor');
assert.ok(monthlyChallenge(opts({ minutesByDate: { ...month('2026-06', 7), ...month('2026-07', 7) } })), 'history need not be last month');

// --- kind rotation: deterministic from the month, all three in three consecutive months ---
assert.deepEqual(KINDS, ['days', 'minutes', 'goalDays']);
const kinds = ['2026-09', '2026-10', '2026-11'].map((m) => challengeKind(m, 30));
assert.deepEqual([...kinds].sort(), ['days', 'goalDays', 'minutes']);
assert.equal(challengeKind('2026-12', 30), challengeKind('2026-09', 30), 'period three');
assert.equal(challengeKind('2027-01', 30), challengeKind('2026-10', 30), 'the year boundary is just another month');
// goalDays needs a daily goal; without one it falls through to days
assert.equal(challengeKind('2026-09', 30), 'goalDays');
assert.equal(challengeKind('2026-09', 0), 'days');

const hist = month('2026-07', 20); // the floor, well clear

// --- days: last month's count + 1, clamped ---
{
  // October 2026 is a 'days' month; September had 10 practised days
  const c = monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: { ...hist, ...month('2026-09', 10), ...month('2026-10', 3) } }))!;
  assert.equal(c.kind, 'days');
  assert.equal(c.month, '2026-10');
  assert.equal(c.target, 11);
  assert.equal(c.done, 3);
  assert.equal(c.met, false);
  assert.equal(c.daysLeft, 27, 'Oct 5 to Oct 31, inclusive');
}
// floor at DAYS_MIN after a thin month, and after an empty one (the regression property)
assert.equal(DAYS_MIN, 4);
assert.equal(monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: { ...hist, ...month('2026-09', 1) } }))!.target, 4);
assert.equal(monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: hist }))!.target, 4, 'an empty month is not a wall');
// never more days than the month has to offer: 31 practised days in September is impossible, but the clamp is to October's 31
assert.equal(monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: { ...hist, ...month('2026-09', 30) } }))!.target, 31);
// ...minus the break days: with Sundays off, October 2026 has 27 practice days
assert.equal(monthlyChallenge(opts({ todayKey: '2026-10-05', breakDays: ['Sunday'], minutesByDate: { ...hist, ...month('2026-09', 30) } }))!.target, 27);
// clamp order: seven break days leave zero practice days, and the floor still wins
{
  const all = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  assert.equal(monthlyChallenge(opts({ todayKey: '2026-10-05', breakDays: all, minutesByDate: { ...hist, ...month('2026-09', 30) } }))!.target, DAYS_MIN);
}
// regression: a bad month lowers next month's bar
{
  const good = monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: { ...hist, ...month('2026-09', 20) } }))!.target;
  const bad = monthlyChallenge(opts({ todayKey: '2026-10-05', minutesByDate: { ...hist, ...month('2026-09', 6) } }))!.target;
  assert.ok(bad < good, `${bad} < ${good}`);
}

// --- minutes: last month × 1.1, rounded up to ten, at least MINUTES_MIN ---
{
  // November 2026 is a 'minutes' month; October had 12 × 30 = 360 min → 396 → 400
  const c = monthlyChallenge(opts({ todayKey: '2026-11-10', minutesByDate: { ...hist, ...month('2026-10', 12), ...month('2026-11', 5, 20) } }))!;
  assert.equal(c.kind, 'minutes');
  assert.equal(c.target, 400);
  assert.equal(c.done, 100);
  assert.equal(c.met, false);
}
assert.equal(MINUTES_MIN, 60);
assert.equal(monthlyChallenge(opts({ todayKey: '2026-11-10', minutesByDate: { ...hist, ...month('2026-10', 1, 10) } }))!.target, 60, 'floor');
// an empty month restarts at RESTART_GOALS daily goals, not at last month's zero
assert.equal(RESTART_GOALS, 12);
assert.equal(monthlyChallenge(opts({ todayKey: '2026-11-10', dailyGoal: 30, minutesByDate: hist }))!.target, 360);
assert.equal(monthlyChallenge(opts({ todayKey: '2026-11-10', dailyGoal: 0, minutesByDate: hist }))!.target, 60, 'no goal, no history: the floor');

// --- goalDays: days at or over the daily goal last month, + 1 ---
{
  // September 2026 is a 'goalDays' month; August: 8 days at 30 and 5 at 20 with a 30 goal → 8 → target 9
  const aug = { ...month('2026-08', 8, 30), ...month('2026-08', 5, 20, 20) };
  const c = monthlyChallenge(opts({ todayKey: '2026-09-22', dailyGoal: 30, minutesByDate: { ...hist, ...aug, ...month('2026-09', 4, 30), ...month('2026-09', 3, 10, 10) } }))!;
  assert.equal(c.kind, 'goalDays');
  assert.equal(c.target, 9);
  assert.equal(c.done, 4, 'only the days at goal count');
  // a fresh 30-minute day carries it: the met flip sits exactly on the boundary
  const at = { ...c };
  const more = monthlyChallenge(opts({ todayKey: '2026-09-22', dailyGoal: 30, minutesByDate: { ...hist, ...aug, ...month('2026-09', 9, 30) } }))!;
  assert.equal(more.done, 9);
  assert.equal(more.met, true);
  assert.equal(at.met, false);
  const under = monthlyChallenge(opts({ todayKey: '2026-09-22', dailyGoal: 30, minutesByDate: { ...hist, ...aug, ...month('2026-09', 8, 30) } }))!;
  assert.equal(under.met, false, 'one short is not met');
  assert.equal(challengeJustMet(under, more), true);
  assert.equal(challengeJustMet(more, more), false, 'already met before the session');
  assert.equal(challengeJustMet(null, more), false, 'no challenge before: nothing to complete');
  assert.equal(challengeJustMet(under, null), false);
}

// --- leap February: the window runs to the 29th ---
{
  // 2028-02 → (2028*12+1) % 3 = 'minutes'; the point is the window, not the kind
  const c = monthlyChallenge(opts({ todayKey: '2028-02-01', minutesByDate: month('2028-01', 20) }))!;
  assert.equal(c.month, '2028-02');
  assert.equal(c.daysLeft, 29);
  assert.equal(monthlyChallenge(opts({ todayKey: '2028-02-29', minutesByDate: month('2028-01', 20) }))!.daysLeft, 1);
  // and a 'days' leap February caps at 29 practice days
  const days = monthlyChallenge(opts({ todayKey: '2028-02-01', dailyGoal: 0, minutesByDate: { ...month('2027-12', 20), ...month('2028-01', 31) } }))!;
  assert.equal(challengeKind('2028-02', 0), 'minutes');
  assert.ok(days.target >= MINUTES_MIN);
}
{
  // a 'days' month that follows a full one: 2028-04 → (2028*12+3) % 3 = 0 → days; March 2028 had 31 → capped at April's 30
  assert.equal(challengeKind('2028-04', 30), 'days');
  const c = monthlyChallenge(opts({ todayKey: '2028-04-02', minutesByDate: { ...month('2028-02', 20), ...month('2028-03', 31) } }))!;
  assert.equal(c.target, 30);
}

// --- determinism: same input, same challenge ---
{
  const o = opts({ minutesByDate: { ...hist, ...month('2026-08', 12), ...month('2026-09', 6) } });
  assert.deepEqual(monthlyChallenge(o), monthlyChallenge(o));
}

console.log('challenge ok');
