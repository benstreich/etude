// Progress definitions (spec 2026-09-15): the stage log every piece carries, and
// the layout registry that decides which sections show. Run: npm run check:movement
import assert from 'node:assert';

import { backfillStageLog } from '../src/lib/migrate.ts';
import { appendStageLog } from '../src/lib/movement-math.ts';

// --- stage log ------------------------------------------------------------
assert.deepEqual(appendStageLog(undefined, '2026-09-01', 1), [{ date: '2026-09-01', stage: 1 }]);
assert.deepEqual(appendStageLog([{ date: '2026-09-01', stage: 1 }], '2026-09-01', 2), [{ date: '2026-09-01', stage: 2 }], 'same day: last write wins');
assert.deepEqual(appendStageLog([{ date: '2026-09-01', stage: 1 }], '2026-09-03', 1), [{ date: '2026-09-01', stage: 1 }], 'same stage: no-op');
assert.deepEqual(appendStageLog([{ date: '2026-09-01', stage: 0 }], '2026-09-03', 1), [{ date: '2026-09-01', stage: 0 }, { date: '2026-09-03', stage: 1 }]);
assert.deepEqual(backfillStageLog({ stage: 2, addedAt: Date.parse('2026-05-04T10:00:00Z') }, '2026-09-14'), [{ date: '2026-05-04', stage: 2 }]);
assert.deepEqual(backfillStageLog({ stage: 0 }, '2026-09-14'), [{ date: '2026-09-14', stage: 0 }]);
assert.deepEqual(backfillStageLog({ stage: 1, stageLog: [{ date: '2026-01-01', stage: 1 }] }, '2026-09-14'), [{ date: '2026-01-01', stage: 1 }], 'existing log untouched');


// --- layout registry ------------------------------------------------------
import { PROGRESS_SECTIONS, resolveLayout } from '../src/lib/progress-sections.ts';
assert.deepEqual(resolveLayout([]), PROGRESS_SECTIONS.map((s) => ({ key: s.key, on: s.defaultOn })), 'empty = defaults');
const saved = [{ key: 'heatmap', on: true }, { key: 'zombie', on: true }, { key: 'movement', on: false }];
const res = resolveLayout(saved);
assert.deepEqual(res.slice(0, 2).map((x) => x.key), ['heatmap', 'movement'], 'saved order kept, unknown dropped');
assert.equal(res.length, PROGRESS_SECTIONS.length, 'missing keys appended');
assert.equal(res.find((x) => x.key === 'goals')!.on, true, 'appended with default');
assert.equal(res.find((x) => x.key === 'movement')!.on, false, 'saved switch kept');
// --- movement, pipeline, freshness, month diff, recording pair -------------
import { freshness, monthDiff, pieceMovement, pipelineCounts, rankMovement, recordingPair } from '../src/lib/movement-math.ts';
const today = '2026-09-14';
const S = (title: string, date: string, min = 20, rating?: number) => ({ id: date + title, title, meta: '', min, date, rating });
const P = (name: string, extra: Record<string, unknown> = {}) => ({ id: name, name, by: '', stage: 0, pct: 0, ...extra }) as any;
const stages = 3;

const stageUp = P('A', { stage: 1, stageLog: [{ date: '2026-08-01', stage: 0 }, { date: '2026-09-01', stage: 1 }] });
assert.deepEqual(pieceMovement(stageUp, [S('A', '2026-09-10')], today, stages).move, { kind: 'stage', from: 0, to: 1 });
const tempoUp = P('B', { tempoLog: [{ date: '2026-08-20', bpm: 100 }, { date: '2026-09-10', bpm: 112 }] });
assert.deepEqual(pieceMovement(tempoUp, [S('B', '2026-09-10')], today, stages).move, { kind: 'tempo', deltaBpm: 12 });
const ratingUp = P('C');
const cs = [S('C', '2026-08-01', 20, 2), S('C', '2026-08-05', 20, 2), S('C', '2026-09-01', 20, 4), S('C', '2026-09-08', 20, 4), S('C', '2026-09-12', 20, 5)];
assert.equal(pieceMovement(ratingUp, cs, today, stages).move.kind, 'rating');
assert.deepEqual(pieceMovement(P('D'), [S('D', '2026-08-20')], today, stages).move, { kind: 'stalled', days: 25 });
assert.deepEqual(pieceMovement(P('E', { stage: 2 }), [S('E', '2026-08-20')], today, stages).move, { kind: 'due', days: 25 }, 'ready + unplayed 21d beats stalled');
assert.deepEqual(pieceMovement(P('F'), [], today, stages).move, { kind: 'new' });
assert.equal(pieceMovement(tempoUp, [S('B', '2026-09-10', 35), S('B', '2026-07-01', 99)], today, stages).minutes, 35, 'minutes inside window only');
assert.deepEqual(pieceMovement(tempoUp, [S('B', '2026-09-10')], today, stages).spark, [100, 112], 'sparkline = tempo log in window');

const ranked = rankMovement([
  pieceMovement(P('F'), [], today, stages),
  pieceMovement(P('D'), [S('D', '2026-08-20')], today, stages),
  pieceMovement(tempoUp, [S('B', '2026-09-10')], today, stages),
  pieceMovement(stageUp, [S('A', '2026-09-10')], today, stages),
]);
assert.deepEqual(ranked.map((m) => m.piece.name), ['A', 'B', 'D', 'F']);

const pc = pipelineCounts([stageUp, P('G', { stage: 2, stageLog: [{ date: '2026-09-03', stage: 2 }] }), P('H', { stage: 2, stageLog: [{ date: '2026-08-15', stage: 2 }] })], stages, today);
assert.deepEqual(pc, { perStage: [0, 1, 2], readyThisMonth: 1, readyLastMonth: 1 });

assert.equal(freshness(today, today), 1);
assert.equal(freshness('2026-08-15', today), 0);
assert.ok(Math.abs(freshness('2026-08-30', today) - 0.5) < 0.01);
assert.equal(freshness(null, today), 0);

const md = monthDiff([P('A', { addedAt: Date.parse('2026-09-02T00:00:00Z') })], [S('A', '2026-09-03', 60, 4), S('A', '2026-08-03', 30, 3)], today);
assert.deepEqual(md.pieces, [1, 0]);
assert.deepEqual(md.hours, [1, 0.5]);
assert.deepEqual(md.stars, [4, 3]);

const R = (id: string, date: string, starred?: boolean) => ({ id, piece: 'A', date, uri: '', sec: 10, starred }) as any;
assert.equal(recordingPair([R('1', '2026-01-01')]), null);
assert.deepEqual(recordingPair([R('2', '2026-02-01'), R('1', '2026-01-01'), R('3', '2026-03-01')])!.map((r) => r.id), ['1', '3']);
assert.deepEqual(recordingPair([R('1', '2026-01-01'), R('2', '2026-02-01', true), R('3', '2026-03-01')])!.map((r) => r.id), ['1', '2'], 'a starred newer one wins the "latest" slot');
console.log('check-movement ok');
