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
console.log('check-movement ok');
