// Stars are the grade (spec 2026-09-15): the rolling average, trend, forecast
// and calibration verdicts have to hold on tiny, gappy logs.
import assert from 'node:assert';

import { addDays, calibration, pieceRatings, ratingForecast, ratingTrend, rollingAvg } from '../src/lib/rating-math.ts';

const piece = { name: 'Asturias' };
const sessions = [
  { title: 'Asturias', date: '2026-08-01', rating: 2 },
  { title: 'Asturias', date: '2026-08-08', rating: 3 },
  { title: 'Scales', date: '2026-08-08', rating: 5 }, // other focus
  { title: 'Asturias', date: '2026-08-15' }, // unrated: skipped
  { title: 'Asturias', date: '2026-08-22', rating: 3 },
  { title: 'Asturias', date: '2026-08-29', rating: 4 },
  { title: 'Asturias', date: '2026-09-05', rating: 4 },
  { title: 'Asturias', date: '2026-09-12', rating: 5 },
];
const r = pieceRatings(piece, sessions);
assert.deepEqual(r.map((x) => x.rating), [2, 3, 3, 4, 4, 5]);
assert.equal(pieceRatings({ name: 'Renamed' }, sessions).length, 0);

assert.equal(rollingAvg([]), null);
assert.equal(rollingAvg(r.slice(0, 1)), null);
assert.equal(rollingAvg(r), (3 + 3 + 4 + 4 + 5) / 5);
assert.equal(rollingAvg(r, 2), 4.5);

const tr = ratingTrend(r, 30, '2026-09-14')!;
assert.ok(tr.delta > 0 && tr.to > tr.from);
assert.equal(ratingTrend(r.slice(0, 1), 30, '2026-09-14'), null);

const fc = ratingForecast(r, 5, '2026-09-14');
assert.ok(fc && fc.reachDate > '2026-09-14', 'rising log forecasts a date');
assert.equal(
  ratingForecast([{ date: '2026-09-01', rating: 3 }, { date: '2026-09-08', rating: 3 }, { date: '2026-09-12', rating: 3 }], 5, '2026-09-14'),
  null,
  'flat log: no forecast',
);

// calibration
const flatTempo = { tempoLog: [{ date: '2026-08-15', bpm: 100 }, { date: '2026-09-12', bpm: 100 }], targetBpm: 140 };
assert.equal(calibration(flatTempo, r, '2026-09-14'), 'grading-feel');
const atTarget = { tempoLog: [{ date: '2026-09-12', bpm: 140 }], targetBpm: 140, currentBpm: 140 };
const low = [3, 3, 2, 3, 3].map((rating, i) => ({ date: `2026-09-0${i + 1}`, rating }));
assert.equal(calibration(atTarget, low, '2026-09-14'), 'not-speed');
const hardDays = [2, 2, 3, 2, 3].map((rating, i) => ({ date: `2026-09-0${i + 1}`, rating }));
const climbing = { tempoLog: [{ date: '2026-08-15', bpm: 90 }, { date: '2026-09-12', bpm: 110 }], targetBpm: 140 };
assert.equal(calibration(climbing, hardDays, '2026-09-14'), 'hard-days-count');
assert.equal(calibration({}, [], '2026-09-14'), null);

// --- addDays --------------------------------------------------------------
// Every window in this file walks dates with addDays. It parses at noon so a
// DST jump cannot roll the answer onto the neighbouring day.
assert.equal(addDays('2026-09-14', 0), '2026-09-14');
assert.equal(addDays('2026-09-14', 1), '2026-09-15');
assert.equal(addDays('2026-09-14', -1), '2026-09-13');
assert.equal(addDays('2026-09-30', 1), '2026-10-01', 'month boundary');
assert.equal(addDays('2026-12-31', 1), '2027-01-01', 'year boundary');
assert.equal(addDays('2026-01-01', -1), '2025-12-31');
assert.equal(addDays('2024-02-28', 1), '2024-02-29', 'leap year');
assert.equal(addDays('2026-02-28', 1), '2026-03-01', 'common year');
assert.equal(addDays('2026-03-29', 1), '2026-03-30', 'EU DST spring forward');
assert.equal(addDays('2026-10-25', 1), '2026-10-26', 'EU DST fall back');
assert.equal(addDays('2026-11-01', 1), '2026-11-02', 'US DST fall back');
assert.equal(addDays('2026-09-14', 30), '2026-10-14');
// walking n days forward then n back returns to the start, for a whole year
for (let n = 1; n <= 365; n++) assert.equal(addDays(addDays('2026-01-01', n), -n), '2026-01-01', `round-trip ${n}`);

console.log('check-rating ok');
