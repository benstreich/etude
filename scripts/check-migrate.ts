// Self-check for the saved-state upgrade logic. Run: npm run check:migrate
import assert from 'node:assert/strict';

import { migrate } from '../src/lib/migrate.ts';

// stand-in for seed() — only the keys migrate touches, plus one to prove merging
const seed = () => ({
  stages: ['Learning', 'Polishing', 'Ready'],
  pieces: [] as { id: string; stage?: number; status?: string }[],
  recordings: [] as { id: string; uri: string }[],
  breakDays: ['Sunday'],
  metroTimeSig: '4/4',
  metroBpm: 90,
  dailyGoal: 45,
});
const save = (s: object) => JSON.stringify(s);

// nothing saved → seed as-is
assert.deepEqual(migrate(null, seed()), seed());

// corrupt or nonsense blobs fall back to seed instead of throwing (a throw here
// would blank the app on every launch)
assert.deepEqual(migrate('{truncated', seed()), seed());
assert.deepEqual(migrate('null', seed()), seed());
assert.deepEqual(migrate('"a string"', seed()), seed());
assert.deepEqual(migrate(save({ pieces: null }), seed()).pieces, []);

// all seven break days would make the streak unbreakable → reset
assert.deepEqual(
  migrate(save({ pieces: [], breakDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }), seed()).breakDays,
  [],
);

// legacy absolute recording URIs become documents-relative; web/blob URIs pass through
assert.deepEqual(
  migrate(
    save({
      pieces: [],
      recordings: [
        { id: 'a', uri: 'file:///data/user/0/com.benstreich.etude/files/Audio/rec1.m4a' },
        { id: 'b', uri: 'file:///var/mobile/Containers/Data/Application/ABC-123/Documents/ExpoAudio/rec2.m4a' },
        { id: 'c', uri: 'Audio/already-relative.m4a' },
        { id: 'd', uri: 'blob:https://etude.app/xyz' },
      ],
    }),
    seed(),
  ).recordings.map((r) => r.uri),
  ['Audio/rec1.m4a', 'ExpoAudio/rec2.m4a', 'Audio/already-relative.m4a', 'blob:https://etude.app/xyz'],
);

// saved values win, keys the save predates are backfilled from seed
const merged = migrate(save({ dailyGoal: 60, pieces: [] }), seed());
assert.equal(merged.dailyGoal, 60);
assert.equal(merged.metroBpm, 90);

// legacy stageLabels → stages list, keeping renames and defaulting blanks
assert.deepEqual(
  migrate(save({ pieces: [], stageLabels: { Learning: 'Woodshedding', Polishing: '', Ready: 'Gig-ready' } }), seed())
    .stages,
  ['Woodshedding', 'Polishing', 'Gig-ready'],
);

// legacy metroBeatsPerBar → time signature, but never over a saved one
assert.equal(migrate(save({ pieces: [], metroBeatsPerBar: 3 }), seed()).metroTimeSig, '3/4');
assert.equal(migrate(save({ pieces: [], metroBeatsPerBar: 3, metroTimeSig: '6/8' }), seed()).metroTimeSig, '6/8');

// legacy piece status → stage index; unknown or missing → 0; existing stage kept
const pieces = migrate(
  save({
    pieces: [
      { id: 'a', status: 'Polishing' },
      { id: 'b', status: 'Nonsense' },
      { id: 'c' },
      { id: 'd', stage: 2, status: 'Learning' },
      { id: 'e', stage: 0 },
    ],
  }),
  seed(),
).pieces.map((p) => p.stage);
assert.deepEqual(pieces, [1, 0, 0, 2, 0]);

// onboarding backfill: existing installs skip it, an explicit false survives, fresh installs get it
assert.equal((migrate(save({ pieces: [] }), { ...seed(), onboarded: false }) as any).onboarded, true);
assert.equal((migrate(save({ pieces: [], onboarded: false }), { ...seed(), onboarded: false }) as any).onboarded, false);
assert.equal((migrate(null, { ...seed(), onboarded: false }) as any).onboarded, false);

console.log('check-migrate: all assertions passed');
