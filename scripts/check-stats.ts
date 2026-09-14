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

// ---- #61 insights
import { concentration, focusDrift, goalCalibration, interleaving, projection, qualityDrivers, rollingMean, staleness, streakSurvival, tempoForecast, weeklyTotals } from '../src/lib/stats-math.ts';

// --- tempoForecast: 2 BPM/day → 122 reached 10 days after the last entry; too short a log → null
const tlog = [0, 7, 14, 21].map((d) => ({ date: `2026-08-${String(1 + d).padStart(2, '0')}`, bpm: 60 + 2 * d }));
const fc = tempoForecast(tlog, 122, '2026-08-23', [])!;
assert.equal(fc.bpmPerWeek, 14);
assert.equal(fc.reachDate, '2026-09-01'); // 102 → 122 at 2/day = 10 days after 08-22
assert.equal(fc.plateau, false);
assert.equal(tempoForecast(tlog.slice(0, 3), 122, '2026-08-23', []), null);
assert.equal(tempoForecast(tlog, 90, '2026-08-23', [])!.reachDate, null); // already past the target
// plateau: plenty of recent minutes, nothing above the pre-window best
const flat = [{ date: '2026-07-01', bpm: 80 }, { date: '2026-07-10', bpm: 84 }, { date: '2026-08-20', bpm: 84 }, { date: '2026-09-01', bpm: 83 }];
assert.equal(tempoForecast(flat, 120, '2026-09-05', [{ min: 70, date: '2026-08-30' }])!.plateau, true);
assert.equal(tempoForecast(flat, 120, '2026-09-05', [{ min: 20, date: '2026-08-30' }])!.plateau, false);

// --- staleness: a weekly piece untouched for 20 days is due; a fresh one is not
assert.deepEqual(staleness(['2026-08-01', '2026-08-08', '2026-08-15'], '2026-09-04'), { daysSince: 20, medianGap: 7, due: true });
assert.equal(staleness(['2026-08-25'], '2026-09-04')!.due, false);
assert.equal(staleness([], '2026-09-04'), null);

// --- qualityDrivers: 8 routine 5-star vs 8 free 3-star → routine wins by 2.0; no other dimension has 8 a side
const drv = qualityDrivers([
  ...Array.from({ length: 8 }, (_, i) => ({ title: 'A', min: 30, date: `2026-08-${String(i + 1).padStart(2, '0')}`, rating: 5, planId: 'p' })),
  ...Array.from({ length: 8 }, (_, i) => ({ title: 'A', min: 30, date: `2026-08-${String(i + 11).padStart(2, '0')}`, rating: 3 })),
]);
assert.deepEqual(drv, [{ dim: 'routine', best: 'routine', gap: 2 }]);
assert.deepEqual(qualityDrivers(sessions), []);

// --- concentration: 80 % held by the top 2 of 4 focuses, over 10 sessions (a×5, b×3, c, d)
const tenSessions = [...'aaaaabbbcd'].map((title) => ({ title, min: 10 }));
assert.deepEqual(concentration(tenSessions), { pct: 80, top: 2, total: 4 });
assert.equal(concentration([{ title: 'a', min: 50 }]), null);
// the same split from only 4 sessions is too thin to state (#77)
assert.equal(concentration([{ title: 'a', min: 50 }, { title: 'b', min: 30 }, { title: 'c', min: 10 }, { title: 'd', min: 10 }]), null);

// --- streakSurvival: three ended runs (3, 2, 1 days); the run that reached yesterday is still alive
const mbd: Record<string, number> = {};
for (const d of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-10', '2026-08-11', '2026-08-17', '2026-09-03']) mbd[d] = 20;
const sv = streakSurvival(mbd, '2026-09-04')!;
assert.equal(sv.count, 3);
assert.equal(sv.typicalLength, 2);
assert.equal(sv.breakWeekday, 2); // breaks on Thu, Wed, Tue — a three-way tie resolves to the lowest weekday
assert.deepEqual(sv.lengths, [3, 2, 1]);
assert.equal(streakSurvival({ '2026-08-03': 20 }, '2026-09-04'), null);

// --- projection: 30 min/day for the last 56 days → next milestone 50 h, 44 days out
const daily: Record<string, number> = {};
for (let i = 0; i < 56; i++) {
  const d = new Date(2026, 8, 1 - i);
  daily[`2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 30;
}
const pj = projection(daily, 56 * 30, '2026-09-01')!;
assert.equal(pj.milestoneH, 50); // 28 h done
assert.equal(pj.milestoneDate, '2026-10-15'); // 22 h left at 0.5 h/day = 44 days
assert.ok(pj.hoursByYearEnd > 80 && pj.hoursByYearEnd < 90, String(pj.hoursByYearEnd));
assert.equal(projection({}, 0, '2026-09-01'), null);
// three practised days are not a pace (#77)
assert.equal(projection({ '2026-08-30': 30, '2026-08-31': 30, '2026-09-01': 30 }, 90, '2026-09-01'), null);

// --- goalCalibration (#72): 20 practised days, half at 20 min and half at 40, goal 45
//     → 60th percentile is 40, hit 0 % today, 50 % at the suggestion; no weekly goal set
const cal: Record<string, number> = {};
for (let i = 0; i < 20; i++) {
  const d = new Date(2026, 8, 1 - i * 2);
  cal[`2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = i % 2 ? 40 : 20;
}
const gc = goalCalibration({ minutesByDate: cal, today: '2026-09-01', dailyGoal: 45, weeklyGoal: 0 });
assert.deepEqual(gc.daily, { goal: 45, suggested: 40, hitCurrent: 0, hitSuggested: 50, n: 20 });
assert.equal(gc.weekly, null);
// a goal already within one step of the suggestion has nothing to say; 19 days is too thin
assert.equal(goalCalibration({ minutesByDate: cal, today: '2026-09-01', dailyGoal: 40, weeklyGoal: 0 }).daily, null);
delete cal['2026-09-01'];
assert.equal(goalCalibration({ minutesByDate: cal, today: '2026-09-01', dailyGoal: 45, weeklyGoal: 0 }).daily, null);
// weekly: 8 completed weeks of 3 × 30 min against a 180-min goal → suggest 90, met 0 % → 100 %
const wk: Record<string, number> = {};
for (let w = 1; w <= 8; w++)
  for (const off of [0, 2, 4]) {
    const d = new Date(2026, 7, 31 - 7 * w + off); // Mondays before Mon 2026-08-31
    wk[`2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 30;
  }
const gw = goalCalibration({ minutesByDate: wk, today: '2026-09-01', dailyGoal: 0, weeklyGoal: 180, weekStart: 'Monday' });
assert.deepEqual(gw.weekly, { goal: 180, suggested: 90, hitCurrent: 0, hitSuggested: 100, n: 8 });

// --- #71 focusDrift: 4 weeks, "a" fades out while "b" takes over; a fifth focus folds into '' (Other)
const drift = focusDrift(
  [
    { title: 'a', min: 30, date: '2026-08-11' }, { title: 'b', min: 10, date: '2026-08-12' },
    { title: 'a', min: 20, date: '2026-08-18' }, { title: 'b', min: 20, date: '2026-08-19' },
    { title: 'a', min: 10, date: '2026-08-25' }, { title: 'b', min: 30, date: '2026-08-26' },
    { title: 'b', min: 40, date: '2026-09-01' }, { title: 'c', min: 5, date: '2026-09-01' }, { title: 'd', min: 5, date: '2026-09-01' },
    { title: 'e', min: 5, date: '2026-09-01' }, { title: 'f', min: 5, date: '2026-09-01' },
  ],
  '2026-09-01', true, 4
)!;
assert.deepEqual(drift.weeks, ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
assert.deepEqual(drift.series.map((x) => x.title), ['b', 'a', 'c', 'd', '']); // top 4 by minutes, then Other
assert.deepEqual(drift.series[1].share, [0.75, 0.5, 0.25, 0]);
assert.ok(Math.abs(drift.series[4].share[3] - 10 / 60) < 1e-9);
assert.equal(focusDrift([{ title: 'a', min: 30, date: '2026-09-01' }], '2026-09-01', true), null);

// --- weeklyTotals + rollingMean
const wt = weeklyTotals({ '2026-08-11': 30, '2026-08-13': 30, '2026-08-25': 15, '2026-09-01': 45 }, '2026-09-01', true, 4);
assert.deepEqual(wt, [60, 0, 15, 45]);
assert.deepEqual(rollingMean(wt, 4), [null, null, null, 30]);
assert.deepEqual(rollingMean([10, 20, 30], 2), [null, 15, 25]);

// --- interleaving: 7 practised days, two focuses on every other day → 1.5 per day, 2 per week
const il: { title: string; date: string }[] = [];
for (let i = 0; i < 7; i++) {
  const d = `2026-08-${String(20 + i).padStart(2, '0')}`;
  il.push({ title: 'a', date: d });
  if (i % 2) il.push({ title: 'b', date: d });
}
const ilv = interleaving(il, '2026-09-01', true)!;
assert.ok(Math.abs(ilv.perDay - 1.4) < 1e-9, String(ilv.perDay)); // 3 of 7 days had two focuses
assert.equal(ilv.perWeek, 2);
assert.equal(interleaving(il.slice(0, 5), '2026-09-01', true), null);

console.log('check-stats: insights passed');
