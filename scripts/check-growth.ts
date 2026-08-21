// Self-checks for the #17 pure logic: review achievements, tempo ladder
// deltas, recap stats. Run: npm run check:growth
import assert from 'node:assert/strict';

import { achievements, recapStats, tempoDelta } from '../src/lib/growth-math.ts';
import { migrate } from '../src/lib/migrate.ts';

// --- achievements: streak chip needs n >= 2, and comes first
const base = { sessionCount: 5, minutesByDate: { '2026-08-21': 30 }, dailyGoal: 45, today: '2026-08-21' };
assert.deepEqual(achievements({ ...base, streak: 1 }), []);
assert.deepEqual(achievements({ ...base, streak: 4 }), [{ kind: 'streak', label: '4-day streak' }]);

// --- achievements: 'First session' shows on the very first session only
assert.deepEqual(achievements({ ...base, streak: 0, sessionCount: 1 }), [{ kind: 'milestone', label: 'First session' }]);

// --- achievements: max 2, priority streak > milestone
const firstToo = achievements({ ...base, streak: 3, sessionCount: 1 });
assert.deepEqual(firstToo, [
  { kind: 'streak', label: '3-day streak' },
  { kind: 'milestone', label: 'First session' },
]);

// --- achievements: 'Goal hit 7 days straight' requires all of the last 7 days at goal
const goalWeek: Record<string, number> = {};
for (let d = 15; d <= 21; d++) goalWeek[`2026-08-${d}`] = 45;
assert.deepEqual(
  achievements({ streak: 0, sessionCount: 9, minutesByDate: goalWeek, dailyGoal: 45, today: '2026-08-21' }).map((a) => a.label),
  ['Goal hit 7 days straight'],
);
assert.deepEqual(
  achievements({ streak: 0, sessionCount: 9, minutesByDate: { ...goalWeek, '2026-08-18': 44 }, dailyGoal: 45, today: '2026-08-21' }),
  [],
);

// --- achievements: 'Best week yet' only when history exists and this window beats it
const history = { '2026-07-01': 60, '2026-08-20': 40, '2026-08-21': 30 };
assert.deepEqual(
  achievements({ streak: 0, sessionCount: 9, minutesByDate: history, dailyGoal: 0, today: '2026-08-21' }).map((a) => a.label),
  ['Best week yet'],
);
// prior week was bigger → no brag
assert.deepEqual(
  achievements({ streak: 0, sessionCount: 9, minutesByDate: { ...history, '2026-07-01': 600 }, dailyGoal: 0, today: '2026-08-21' }),
  [],
);
// no history at all → not "best" yet
assert.deepEqual(
  achievements({ streak: 0, sessionCount: 9, minutesByDate: { '2026-08-21': 30 }, dailyGoal: 0, today: '2026-08-21' }),
  [],
);

// --- tempoDelta: baseline is the last entry before the month
const log = [
  { date: '2026-07-10', bpm: 80 },
  { date: '2026-08-05', bpm: 88 },
  { date: '2026-08-20', bpm: 92 },
];
assert.equal(tempoDelta(log, '2026-08-21'), 12);
// no entry before the month → first in-month entry is the baseline
assert.equal(tempoDelta(log.slice(1), '2026-08-21'), 4);
// no entries this month → 0; regression comes back negative
assert.equal(tempoDelta(log.slice(0, 1), '2026-08-21'), 0);
assert.equal(tempoDelta([{ date: '2026-07-10', bpm: 100 }, { date: '2026-08-05', bpm: 90 }], '2026-08-21'), -10);
assert.equal(tempoDelta([], '2026-08-21'), 0);

// --- recapStats: monthly slice
const sessions = [
  { title: 'Clair de Lune', min: 60, date: '2026-08-02' },
  { title: 'Scales', min: 10, date: '2026-08-03' },
  { title: 'Clair de Lune', min: 20, date: '2026-07-30' },
];
const aug = recapStats({
  sessions,
  minutesByDate: { '2026-08-01': 30, '2026-08-02': 60, '2026-08-03': 10, '2026-07-30': 20 },
  breakDays: [],
  year: 2026,
  month: 7,
});
assert.equal(aug.totalMin, 100);
assert.equal(aug.daysPracticed, 3);
assert.equal(aug.longestStreak, 3); // Aug 1–3
assert.equal(aug.topPiece, 'Clair de Lune');

// --- recapStats: year-so-far monthly bars + streak across a month boundary
const year = recapStats({
  sessions,
  minutesByDate: { '2026-08-01': 30, '2026-08-02': 60, '2026-08-03': 10, '2026-07-31': 20 },
  breakDays: [],
  year: 2026,
});
assert.equal(year.totalMin, 120);
assert.equal(year.monthlyMinutes[6], 20);
assert.equal(year.monthlyMinutes[7], 100);
assert.equal(year.longestStreak, 4); // Jul 31 – Aug 3
assert.equal(recapStats({ sessions: [], minutesByDate: {}, breakDays: [], year: 2026 }).topPiece, null);

// --- migrate: old blobs get an empty plans array; junk plans values are reset
assert.deepEqual((migrate(JSON.stringify({ totalMin: 5 }), { plans: [] as unknown[] }) as { plans: unknown[] }).plans, []);
assert.deepEqual((migrate(JSON.stringify({ plans: 'junk' }), { plans: [] as unknown[] }) as { plans: unknown[] }).plans, []);

console.log('check-growth: all assertions passed');
