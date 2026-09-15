// Period goals and piece deadlines (#56): the derived target, the pace line,
// and the on-track verdict all have to hold on ordinary calendars.
import assert from 'node:assert';

import { daysUntil, deadlineStatus, goalProgress, periodMinutes, periodRange, practiceDays } from '../src/lib/goal-math.ts';

// --- ranges ---------------------------------------------------------------
// 2026-09-16 is a Wednesday
assert.deepEqual(periodRange('week', '2026-09-16', 'Monday'), { from: '2026-09-14', to: '2026-09-20' });
assert.deepEqual(periodRange('week', '2026-09-16', 'Sunday'), { from: '2026-09-13', to: '2026-09-19' });
assert.deepEqual(periodRange('week', '2026-09-14', 'Monday').from, '2026-09-14'); // Monday is its own start
assert.deepEqual(periodRange('month', '2026-09-16'), { from: '2026-09-01', to: '2026-09-30' });
assert.deepEqual(periodRange('month', '2026-02-05'), { from: '2026-02-01', to: '2026-02-28' });
assert.deepEqual(periodRange('month', '2024-02-05').to, '2024-02-29'); // leap year
assert.deepEqual(periodRange('year', '2026-09-16'), { from: '2026-01-01', to: '2026-12-31' });

// --- totals ---------------------------------------------------------------
const mins = { '2026-09-13': 10, '2026-09-14': 30, '2026-09-16': 20, '2026-10-01': 99 };
assert.equal(periodMinutes(mins, '2026-09-14', '2026-09-20'), 50);
assert.equal(periodMinutes(mins, '2026-09-01', '2026-09-30'), 60);

// --- practice days --------------------------------------------------------
assert.equal(practiceDays('2026-09-14', '2026-09-20'), 7);
assert.equal(practiceDays('2026-09-14', '2026-09-20', ['Sunday']), 6);
assert.equal(practiceDays('2026-09-14', '2026-09-20', ['Saturday', 'Sunday']), 5);
assert.equal(practiceDays('2026-01-01', '2026-12-31'), 365);

// --- goal progress --------------------------------------------------------
const base = { todayKey: '2026-09-16', minutesByDate: mins, dailyGoal: 30, breakDays: ['Sunday'], weekStart: 'Monday' as const };

// goal 0 derives from the daily goal × practice days (6 this week, Sunday off)
const w = goalProgress({ ...base, period: 'week', goal: 0 });
assert.equal(w.target, 180);
assert.equal(w.done, 50); // Mon 30 + Wed 20; Sunday the 13th belongs to last week
assert.equal(w.pace, 90); // 3 practice days elapsed of 6
assert.equal(w.onTrack, false);
assert.equal(w.left, 130);
assert.equal(w.pct, 28);

// an explicit goal wins over the derived one
assert.equal(goalProgress({ ...base, period: 'week', goal: 50 }).target, 50);
const met = goalProgress({ ...base, period: 'week', goal: 50 });
assert.equal(met.onTrack, true);
assert.equal(met.left, 0);
assert.equal(met.pct, 100); // never overshoots 100

// month and year see the same ledger, wider window
assert.equal(goalProgress({ ...base, period: 'month', goal: 0 }).done, 60);
assert.equal(goalProgress({ ...base, period: 'year', goal: 0 }).done, 60); // October is in the future, not counted

// a zero daily goal must not divide-by-zero or claim progress
const none = goalProgress({ ...base, period: 'week', goal: 0, dailyGoal: 0 });
assert.equal(none.target, 0);
assert.equal(none.pct, 0);
assert.equal(none.onTrack, true);

// pace never exceeds the target, on the period's last day it equals it
const last = goalProgress({ ...base, period: 'week', goal: 180, todayKey: '2026-09-20' });
assert.equal(last.pace, 180);

// --- deadlines ------------------------------------------------------------
assert.equal(daysUntil('2026-09-23', '2026-09-16'), 7);
assert.equal(daysUntil('2026-09-16', '2026-09-16'), 0);
assert.equal(daysUntil('2026-09-14', '2026-09-16'), -2);
// DST crossing (Europe, last Sunday of October) must still be whole days
assert.equal(daysUntil('2026-11-01', '2026-10-01'), 31);

const added = new Date(2026, 8, 2).getTime(); // 2026-09-02, 21 days before the target
const dl = { targetDate: '2026-09-23', todayKey: '2026-09-16', addedAt: added, stages: 3 };
assert.equal(deadlineStatus({ ...dl, stage: 0 }).onTrack, false); // 2/3 of the run-up gone, still stage 1 of 3
assert.equal(deadlineStatus({ ...dl, stage: 1 }).onTrack, true);
assert.equal(deadlineStatus({ ...dl, stage: 2 }).done, true);
assert.equal(deadlineStatus({ ...dl, stage: 2 }).days, 7);

// past due, but finished — done and never flagged
const late = deadlineStatus({ ...dl, todayKey: '2026-09-30', stage: 2 });
assert.equal(late.overdue, false);
assert.equal(late.onTrack, true);
// past due and unfinished
const missed = deadlineStatus({ ...dl, todayKey: '2026-09-30', stage: 0 });
assert.equal(missed.overdue, true);
assert.equal(missed.days, -7);
assert.equal(missed.onTrack, false);

// a piece added today with a target today mustn't divide by zero
const sameDay = deadlineStatus({ targetDate: '2026-09-16', todayKey: '2026-09-16', addedAt: new Date(2026, 8, 16).getTime(), stage: 0, stages: 3 });
assert.ok(Number.isFinite(sameDay.days));
assert.equal(sameDay.days, 0);

// rating target (spec 2026-09-15): on track only if the forecast lands before the deadline
const withRating = deadlineStatus({ ...dl, stage: 1, targetRating: 4.5, ratingAvg: 3.2, ratingReachDate: '2027-01-01' });
assert.ok(withRating.lagging.includes('rating'));
assert.equal(withRating.onTrack, false);
const ratingOk = deadlineStatus({ ...dl, stage: 1, targetRating: 4.5, ratingAvg: 4.6, ratingReachDate: null });
assert.ok(!ratingOk.lagging.includes('rating'));
assert.equal(ratingOk.onTrack, true);
const ratingSoon = deadlineStatus({ ...dl, stage: 1, targetRating: 4.5, ratingAvg: 4.0, ratingReachDate: '2026-09-20' });
assert.ok(!ratingSoon.lagging.includes('rating'), 'forecast before the deadline is on pace');
assert.deepEqual(deadlineStatus({ ...dl, stage: 0 }).lagging, ['stage']);
assert.deepEqual(deadlineStatus({ ...dl, stage: 1, targetBpm: 120, tempoReachDate: '2026-12-01' }).lagging, ['tempo']);
assert.deepEqual(deadlineStatus({ ...dl, stage: 2, targetRating: 5, ratingAvg: 2, ratingReachDate: null }).lagging, ['rating'], 'done stage still lags on rating');

console.log('goal ok');
