// Self-checks for the #54 rating statistics. Run: npm run check:stats
import assert from 'node:assert/strict';

import { byLength, byTimeOfDay, consistency, minPerBpm, ratingByFocus, ratingByWeek, ratingSummary } from '../src/lib/stats-math.ts';

const at = (h: number) => new Date(2026, 8, 10, h, 0).getTime();
const sessions = [
  { title: 'Nocturne', min: 30, date: '2026-09-10', rating: 4, at: at(9) },
  { title: 'Nocturne', min: 45, date: '2026-09-09', rating: 5, at: at(10) },
  { title: 'Nocturne', min: 20, date: '2026-09-03', rating: 3, at: at(20) },
  { title: 'Scales', min: 10, date: '2026-09-08', rating: 2, at: at(14) },
  { title: 'Scales', min: 15, date: '2026-09-01', rating: 2 },
  { title: 'Scales', min: 70, date: '2026-08-25', rating: 3 },
  { title: 'Etude', min: 30, date: '2026-09-10' }, // unrated, no timestamp
];

// --- ratingByWeek: Monday weeks, oldest first, current week last, unrated minutes still count
const weeks = ratingByWeek(sessions, '2026-09-10', true, 4);
assert.deepEqual(weeks.map((w) => w.week), ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']);
assert.deepEqual(weeks[3], { week: '2026-09-07', min: 115, avgRating: 3.7 });
assert.deepEqual(weeks[2], { week: '2026-08-31', min: 35, avgRating: 2.5 });
assert.equal(weeks[0].avgRating, null);
// Sunday start: 2026-09-06 is a Sunday, so the 8th–10th fall into that week
assert.equal(ratingByWeek(sessions, '2026-09-10', false, 1)[0].week, '2026-09-06');

// --- ratingByFocus: sorted by minutes, avg needs 3 rated sessions
const focus = ratingByFocus(sessions);
assert.deepEqual(focus.map((f) => f.title), ['Nocturne', 'Scales', 'Etude']);
assert.equal(focus[0].avgRating, 4);
assert.equal(focus[1].avgRating, 2.3);
assert.equal(focus[2].avgRating, null);

// --- byTimeOfDay: sessions without `at` are skipped
const tod = byTimeOfDay(sessions);
assert.deepEqual(tod.map((b) => b.n), [2, 1, 1]);
assert.equal(tod[0].avgRating, 4.5);
assert.equal(tod[0].min, 75);

// --- byLength: 15 min lands in "15–30", 70 in "60+"
const len = byLength(sessions);
assert.deepEqual(len.map((b) => b.n), [1, 2, 2, 1, 1]);
assert.equal(len[4].avgRating, 3);
assert.equal(len[3].avgRating, 5);
assert.equal(len[0].avgRating, 2);

// --- consistency: days per week, average over past active weeks only
const c = consistency({ '2026-09-10': 30, '2026-09-09': 30, '2026-09-08': 5, '2026-09-01': 10, '2026-08-25': 10, '2026-08-26': 10 }, '2026-09-10', true, 4);
assert.deepEqual(c.perWeek, [0, 2, 1, 3]);
assert.equal(c.current, 3);
assert.equal(c.average, 1.5);
assert.deepEqual(consistency({}, '2026-09-10', true, 2), { perWeek: [0, 0], current: 0, average: 0 });

// --- ratingSummary: hidden below 5 rated, best piece needs 3 rated sessions
assert.deepEqual(ratingSummary(sessions.slice(0, 4)), { avgRating: null, bestPiece: null });
assert.deepEqual(ratingSummary(sessions), { avgRating: 3.2, bestPiece: 'Nocturne' });

// --- minPerBpm: minutes since the first entry over BPM gained
const log = [{ date: '2026-09-01', bpm: 80 }, { date: '2026-09-10', bpm: 90 }];
assert.equal(minPerBpm(log, sessions.filter((s) => s.title === 'Nocturne')), 10); // 95 min / 10 BPM → 10
assert.equal(minPerBpm(log.slice(1), sessions), null);
assert.equal(minPerBpm([{ date: '2026-09-01', bpm: 90 }, { date: '2026-09-10', bpm: 85 }], sessions), null);

console.log('check-stats: all assertions passed');
