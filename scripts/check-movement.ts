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

// --- section availability (why a row in the layout sheet is locked) --------
import { sectionUnavailable, type AvailabilityInput } from '../src/lib/progress-availability.ts';

const emptyInput = {
  sessions: [], pieces: [], recordings: [], mbd: {}, today: '2026-09-14', monday: true, lastStage: 2, hasGoals: false,
} as unknown as AvailabilityInput;

// always renderable, even with nothing logged
assert.equal(sectionUnavailable('heatmap', emptyInput), null);
assert.equal(sectionUnavailable('volume', emptyInput), null);
assert.equal(sectionUnavailable('nonsense-key', emptyInput), null, 'an unknown key never locks a row');

assert.deepEqual(sectionUnavailable('movement', emptyInput), { reason: 'pieces', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('pipeline', emptyInput), { reason: 'pieces', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('timeByFocus', emptyInput), { reason: 'sessions', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('consistency', emptyInput), { reason: 'sessions', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('goals', emptyInput), { reason: 'goals', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('hear', emptyInput), { reason: 'recordings', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('performable', emptyInput), { reason: 'ready', have: 0, need: 0 });
assert.deepEqual(sectionUnavailable('rating', emptyInput), { reason: 'rated', have: 0, need: 1 });
assert.deepEqual(sectionUnavailable('timeOfDay', emptyInput), { reason: 'rated', have: 0, need: 5 });
assert.deepEqual(sectionUnavailable('insights', emptyInput), { reason: 'history', have: 0, need: 7 });

const withData = {
  ...emptyInput,
  pieces: [{ id: 'p1', name: 'Asturias', stage: 2 }, { id: 'p2', name: 'Study', stage: 0 }],
  sessions: [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, title: 'Asturias', meta: '', min: 20, date: `2026-09-0${n}`, rating: 4 })),
  recordings: [
    { id: 'r1', piece: 'p1', date: '2026-08-01', uri: '', sec: 10 },
    { id: 'r2', piece: 'p1', date: '2026-09-01', uri: '', sec: 10 },
  ],
  mbd: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`2026-09-0${n}`, 20])),
  hasGoals: true,
} as unknown as AvailabilityInput;

for (const key of ['movement', 'pipeline', 'timeByFocus', 'consistency', 'goals', 'hear', 'performable', 'rating', 'timeOfDay', 'insights']) {
  assert.equal(sectionUnavailable(key, withData), null, `${key} should be available with a full fixture`);
}

// a piece with one recording is not a before-and-after
const oneRec = { ...withData, recordings: [{ id: 'r1', piece: 'p1', date: '2026-08-01', uri: '', sec: 10 }] } as unknown as AvailabilityInput;
assert.deepEqual(sectionUnavailable('hear', oneRec), { reason: 'recordings', have: 0, need: 0 });

// four rated sessions is still under the floor the cards enforce
const fourRated = { ...withData, sessions: (withData.sessions as unknown[]).slice(0, 4) } as unknown as AvailabilityInput;
assert.deepEqual(sectionUnavailable('timeOfDay', fourRated), { reason: 'rated', have: 4, need: 5 });
assert.equal(sectionUnavailable('rating', fourRated), null, 'the per-piece rating chart only needs one');

// nothing at the last stage yet
const noReady = { ...withData, pieces: [{ id: 'p2', name: 'Study', stage: 0 }] } as unknown as AvailabilityInput;
assert.deepEqual(sectionUnavailable('performable', noReady), { reason: 'ready', have: 0, need: 0 });
console.log('check-movement: availability passed');

// Reason strings are looked up dynamically, so check:i18n cannot see them.
import de from '../src/locales/de.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };

const REASONS = ['sessions', 'pieces', 'rated', 'history', 'recordings', 'goals', 'ready'];
for (const [lang, dict] of [['en', en], ['de', de]] as const) {
  const prog = (dict as Record<string, any>).progress;
  for (const r of REASONS) {
    assert.ok(typeof prog.unavailable?.[r] === 'string' && prog.unavailable[r].length > 5, `${lang}: progress.unavailable.${r} missing`);
  }
  for (const key of ['chartCalendar', 'chartLine', 'chartBars', 'chartEmpty']) {
    assert.ok(typeof prog[key] === 'string' && prog[key].length > 0, `${lang}: progress.${key} missing`);
  }
  for (const k of ['rated', 'history']) {
    assert.ok(prog.unavailable[k].includes('%{have}') && prog.unavailable[k].includes('%{need}'), `${lang}: ${k} must name both counts`);
  }
}
console.log('check-movement: reason strings passed');
