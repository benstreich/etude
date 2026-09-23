// "Suggested for today" (#95): the composer's priority order, its budget, and
// that it is deterministic and degrades to null. Run: npm run check:suggest
import assert from 'node:assert/strict';

import type { Piece, Session } from '../src/lib/store';
import { budgetFor, MAX_SEGMENTS, suggestSession, withMinutes, type Suggestion } from '../src/lib/suggest-math.ts';

const today = '2026-09-22';
const d = (back: number) => {
  const [y, m, dd] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, dd - back);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const piece = (name: string, extra: Partial<Piece> = {}): Piece => ({ id: name, name, by: '', stage: 0, pct: 10, addedAt: 1, ...extra });
const sess = (title: string, back: number, min: number): Session => ({ id: `${title}-${back}`, title, meta: 'Piece', min, date: d(back) });
const mbd = (list: Session[]) => list.reduce<Record<string, number>>((a, s) => ((a[s.date] = (a[s.date] ?? 0) + s.min), a), {});

// --- a library showing every signal at once ---
// A: stalled 20 days. B: stalled 36 days (ranks first). C: tempo plateau short of
// its target. D: had every week to itself two months ago, next to nothing since.
// E: practised yesterday, so nothing is wrong with it — only its due spot brings it in.
const pieces = [
  piece('A'),
  piece('B'),
  piece('C', {
    currentBpm: 106,
    targetBpm: 120,
    tempoLog: [
      { date: d(40), bpm: 100 },
      { date: d(35), bpm: 104 },
      { date: d(30), bpm: 106 },
      { date: d(10), bpm: 104 },
      { date: d(5), bpm: 106 },
    ],
  }),
  piece('D'),
  piece('E'),
];
const sessions = [
  sess('A', 20, 30),
  sess('B', 40, 30),
  sess('B', 38, 30),
  sess('B', 36, 30),
  sess('C', 10, 40),
  sess('C', 5, 40),
  sess('D', 70, 30),
  sess('D', 63, 30),
  sess('D', 56, 30),
  sess('D', 49, 30),
  sess('D', 3, 5),
  sess('E', 1, 30),
];
const base = { pieces, sessions, minutesByDate: mbd(sessions), dailyGoal: 30, today, monday: true, stages: 3 };
const keys = (r: { segments: Suggestion[] } | null) => r?.segments.map((s) => `${s.reasonKey}:${s.focusName}`);

// (a) thin data → null, however loud the signals
assert.equal(suggestSession({ ...base, minutesByDate: { [d(1)]: 30, [d(2)]: 30, [d(3)]: 30 } }), null);

// (b) priority: spot > stalled > review > plateau, and the fifth signal is cut at MAX_SEGMENTS
const full = suggestSession({ ...base, spots: [{ pieceName: 'E', label: 'bars 3–4' }] });
assert.deepEqual(keys(full), ['spotDue:E', 'stalled:B', 'review:A', 'plateau:C']);
assert.equal(full!.segments.length, MAX_SEGMENTS);
assert.equal(full!.segments[3].bpm, 106, 'the plateau segment carries the current tempo');
assert.equal(full!.segments[0].bpm, undefined);

// (e) spots omitted → rule 1 skipped, the rest intact, and drift now fits
const noSpots = suggestSession(base);
assert.deepEqual(keys(noSpots), ['stalled:B', 'review:A', 'plateau:C', 'drift:D']);

// one segment per piece: the piece with the most due spots is not also "stalled"
{
  const r = suggestSession({ ...base, spots: [{ pieceName: 'B', label: 'x' }, { pieceName: 'B', label: 'y' }, { pieceName: 'E', label: 'z' }] });
  assert.deepEqual(keys(r)!.slice(0, 2), ['spotDue:B', 'stalled:A'], 'B is taken by its spots, so the stalled slot falls to A');
  assert.equal(new Set(r!.segments.map((s) => s.focusName)).size, r!.segments.length);
}

// (c) budget: the sum never exceeds the daily goal, every segment is 5..30 in steps of 5, the first is the largest
for (const r of [full!, noSpots!]) {
  const mins = r.segments.map((s) => s.min);
  assert.ok(mins.reduce((a, b) => a + b, 0) <= 30, `sum ${mins}`);
  for (const m of mins) assert.ok(m >= 5 && m <= 30 && m % 5 === 0, `segment ${m}`);
  assert.ok(mins.every((m) => m <= mins[0]));
}
assert.deepEqual(noSpots!.segments.map((s) => s.min), [10, 5, 5, 5]);

// (d) deterministic: the same input twice is deep-equal, and array order does not matter
assert.deepEqual(suggestSession(base), suggestSession(base));
assert.deepEqual(suggestSession({ ...base, pieces: [...pieces].reverse() }), suggestSession(base));

// fewer than two signals → null
assert.equal(suggestSession({ ...base, pieces: [piece('A')], sessions: [sess('A', 20, 30)], minutesByDate: { ...mbd(sessions) } }), null);

// archived pieces are never suggested
assert.equal(suggestSession({ ...base, pieces: pieces.map((p) => ({ ...p, archived: true })) }), null);

// techniques come through with their kind
{
  const r = suggestSession({ ...base, pieces: pieces.map((p) => (p.name === 'B' ? { ...p, kind: 'Technique' } : p)) });
  assert.equal(r!.segments.find((s) => s.focusName === 'B')!.kind, 'Technique');
}

// --- withMinutes ---
const segs = (n: number): Suggestion[] => Array.from({ length: n }, (_, i) => ({ focusName: String(i), kind: 'Piece', reasonKey: 'review', min: 0 }));
assert.deepEqual(withMinutes(segs(4), 100)!.map((s) => s.min), [30, 30, 20, 10], 'clamped at 30, first largest');
assert.deepEqual(withMinutes(segs(3), 12)!.map((s) => s.min), [5, 5], 'a segment is dropped rather than the budget exceeded');
assert.equal(withMinutes(segs(2), 7), null, 'a budget that cannot hold two segments is no session');

// --- budgetFor: the daily goal, unless calibration says less ---
assert.equal(budgetFor({ minutesByDate: mbd(sessions), today, dailyGoal: 30 }), 30, 'too few days to calibrate');
{
  // 25 practised days at 15 min: a 45-minute goal calibrates down to 15
  const many: Record<string, number> = {};
  for (let i = 1; i <= 25; i++) many[d(i)] = 15;
  assert.equal(budgetFor({ minutesByDate: many, today, dailyGoal: 45 }), 15);
  assert.equal(budgetFor({ minutesByDate: many, today, dailyGoal: 10 }), 10, 'never above the goal');
}

console.log('suggest ok');
