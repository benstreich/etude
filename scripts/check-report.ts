// Teacher export (#99): the report's aggregation on fixtures. Run: npm run check:report
import assert from 'node:assert/strict';

import { clipNote, MAX_NOTES, MAX_ROWS, NOTE_CHARS, reportData, reportRange, tempoDeltaIn } from '../src/lib/report-math.ts';

const today = '2026-09-23'; // a Wednesday
const sess = (date: string, title: string, min: number, extra: Partial<{ note: string; rating: number; at: number; spot: string }> = {}) => ({ date, title, min, ...extra });

// --- ranges ---
assert.deepEqual(reportRange({ kind: 'week', anchor: today }, 'Monday'), { start: '2026-09-21', end: '2026-09-27' });
assert.deepEqual(reportRange({ kind: 'week', anchor: today }, 'Sunday'), { start: '2026-09-20', end: '2026-09-26' });
assert.deepEqual(reportRange({ kind: 'month', anchor: today }, 'Monday'), { start: '2026-09-01', end: '2026-09-30' });
assert.deepEqual(reportRange({ kind: 'month', anchor: '2026-02-10' }, 'Monday'), { start: '2026-02-01', end: '2026-02-28' });
assert.deepEqual(reportRange({ kind: 'week', anchor: '2026-01-01' }, 'Monday'), { start: '2025-12-29', end: '2026-01-04' }, 'a week can straddle the year');

// --- empty period → null ---
assert.equal(reportData({ sessions: [], minutesByDate: {}, pieces: [], period: { kind: 'week', anchor: today }, weekStart: 'Monday' }), null);
assert.equal(
  reportData({ sessions: [sess('2026-09-10', 'A', 20)], minutesByDate: { '2026-09-10': 20 }, pieces: [], period: { kind: 'week', anchor: today }, weekStart: 'Monday' }),
  null,
  'practice outside the week does not count',
);

// --- a week ---
const sessions = [
  sess('2026-09-21', 'Für Elise', 30, { note: 'Bars 12–16 slowly', rating: 3, at: 100 }),
  sess('2026-09-21', 'Scales & arpeggios', 10, { at: 200 }),
  sess('2026-09-22', 'Für Elise', 20, { rating: 4, at: 300, spot: 'sp1' }),
  sess('2026-09-23', 'Clair de Lune', 25, { note: '  First read-through.  ', at: 400 }),
  sess('2026-09-23', 'Für Elise', 5, { at: 350, spot: 'sp1' }),
  sess('2026-09-19', 'Für Elise', 60, { note: 'last week' }),
  sess('2026-09-28', 'Für Elise', 60, { note: 'next week' }),
];
const minutesByDate = { '2026-09-19': 60, '2026-09-21': 40, '2026-09-22': 20, '2026-09-23': 30, '2026-09-28': 60 };
const pieces = [
  { name: 'Für Elise', tempoLog: [{ date: '2026-09-15', bpm: 80 }, { date: '2026-09-21', bpm: 84 }, { date: '2026-09-23', bpm: 90 }] },
  { name: 'Clair de Lune', tempoLog: [{ date: '2026-09-10', bpm: 60 }] },
  { name: 'Scales & arpeggios' },
];
{
  const r = reportData({ sessions, minutesByDate, pieces, period: { kind: 'week', anchor: today }, weekStart: 'Monday' })!;
  assert.ok(r);
  assert.deepEqual(r.range, { start: '2026-09-21', end: '2026-09-27' });
  assert.equal(r.totalMin, 90);
  assert.equal(r.days, 3);
  assert.equal(r.sessionCount, 5);
  // every day of the week, zeros included, in order
  assert.deepEqual(r.perDay.map((d) => d.min), [40, 20, 30, 0, 0, 0, 0]);
  assert.equal(r.perDay[0].date, '2026-09-21');
  assert.equal(r.perDay[6].date, '2026-09-27');
  // rows by minutes, then name
  assert.deepEqual(r.pieceRows.map((x) => [x.name, x.min, x.sessions]), [['Für Elise', 55, 3], ['Clair de Lune', 25, 1], ['Scales & arpeggios', 10, 1]]);
  assert.equal(r.pieceRows[0].spotSessions, 2);
  assert.equal(r.pieceRows[1].spotSessions, 0);
  // ratings: the mean of the rated sessions; none rated → null
  assert.equal(r.pieceRows[0].avgRating, 3.5);
  assert.equal(r.pieceRows[1].avgRating, null);
  // tempo: across the week against the baseline before it; no entry in range → null; no log → null
  assert.equal(r.pieceRows[0].tempoDelta, 10);
  assert.equal(r.pieceRows[1].tempoDelta, null);
  assert.equal(r.pieceRows[2].tempoDelta, null);
  // notes: chronological, trimmed, only from the period
  assert.deepEqual(r.notes.map((n) => [n.date, n.focus, n.note]), [['2026-09-21', 'Für Elise', 'Bars 12–16 slowly'], ['2026-09-23', 'Clair de Lune', 'First read-through.']]);
  assert.equal(r.notes[0].at, 100);
  assert.equal(r.morePieces, 0);
  assert.equal(r.moreNotes, 0);
}
// the same week from a Sunday start pulls the 19th out and the 20th in
{
  const r = reportData({ sessions, minutesByDate, pieces, period: { kind: 'week', anchor: today }, weekStart: 'Sunday' })!;
  assert.deepEqual(r.range, { start: '2026-09-20', end: '2026-09-26' });
  assert.equal(r.totalMin, 90);
  assert.equal(r.perDay[0].min, 0, 'the 20th had nothing');
}
// the month takes both weeks
{
  const r = reportData({ sessions, minutesByDate, pieces, period: { kind: 'month', anchor: today }, weekStart: 'Monday' })!;
  assert.equal(r.perDay.length, 30);
  assert.equal(r.totalMin, 210);
  assert.equal(r.sessionCount, 7);
  assert.equal(r.notes.length, 4);
  assert.equal(r.pieceRows[0].tempoDelta, 10, 'the first entry of the month is the baseline when nothing precedes it');
}

// --- pieceFilter narrows everything consistently ---
{
  const r = reportData({ sessions, minutesByDate, pieces, period: { kind: 'week', anchor: today }, weekStart: 'Monday', pieceFilter: 'Für Elise' })!;
  assert.equal(r.totalMin, 55);
  assert.equal(r.sessionCount, 3);
  assert.equal(r.days, 3);
  assert.deepEqual(r.perDay.map((d) => d.min), [30, 20, 5, 0, 0, 0, 0], 'days come from the piece’s sessions, not the store totals');
  assert.deepEqual(r.pieceRows.map((x) => x.name), ['Für Elise']);
  assert.deepEqual(r.notes.map((n) => n.focus), ['Für Elise']);
  assert.equal(reportData({ sessions, minutesByDate, pieces, period: { kind: 'week', anchor: today }, weekStart: 'Monday', pieceFilter: 'Nothing' }), null);
}

// --- ties sort by name; caps count the rest ---
{
  const many = Array.from({ length: 14 }, (_, i) => sess('2026-09-22', `Piece ${String.fromCharCode(90 - i)}`, 10, { note: `note ${i}` }));
  const r = reportData({ sessions: many, minutesByDate: { '2026-09-22': 140 }, pieces: [], period: { kind: 'week', anchor: today }, weekStart: 'Monday' })!;
  assert.equal(r.pieceRows.length, MAX_ROWS);
  assert.equal(r.morePieces, 4);
  assert.deepEqual(r.pieceRows.slice(0, 3).map((x) => x.name), ['Piece M', 'Piece N', 'Piece O'], 'equal minutes → alphabetical');
  assert.equal(r.notes.length, MAX_NOTES);
  assert.equal(r.moreNotes, 2);
  // a day total that disagrees with the sessions is still the day total
  assert.equal(r.totalMin, 140);
}

// --- notes are clipped on a word ---
assert.equal(clipNote('short'), 'short');
assert.equal(clipNote('  spaced   out  '), 'spaced out');
{
  const long = 'word '.repeat(60).trim();
  const c = clipNote(long);
  assert.ok(c.length <= NOTE_CHARS);
  assert.ok(c.endsWith('…'));
  assert.ok(!c.endsWith(' …'), 'no space before the ellipsis');
  assert.equal(clipNote('x'.repeat(300)).length, NOTE_CHARS, 'no word boundary: a hard cut');
}

// --- tempoDeltaIn edge cases ---
assert.equal(tempoDeltaIn(undefined, '2026-09-01', '2026-09-30'), null);
assert.equal(tempoDeltaIn([], '2026-09-01', '2026-09-30'), null);
assert.equal(tempoDeltaIn([{ date: '2026-09-10', bpm: 60 }], '2026-09-01', '2026-09-30'), 0, 'one entry, no baseline → flat');
assert.equal(tempoDeltaIn([{ date: '2026-08-10', bpm: 60 }, { date: '2026-09-10', bpm: 72 }], '2026-09-01', '2026-09-30'), 12);
assert.equal(tempoDeltaIn([{ date: '2026-09-10', bpm: 72 }, { date: '2026-08-10', bpm: 80 }], '2026-09-01', '2026-09-30'), -8, 'unsorted input, a drop');

console.log('check-report: all assertions passed');
