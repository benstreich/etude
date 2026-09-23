// Self-check for the saved-state upgrade logic. Run: npm run check:migrate
import assert from 'node:assert/strict';

import { backfillSpots, migrate } from '../src/lib/migrate.ts';

// stand-in for seed() — only the keys migrate touches, plus one to prove merging
const seed = () => ({
  stages: ['Learning', 'Polishing', 'Ready'],
  pieces: [] as { id: string; stage?: number; status?: string }[],
  recordings: [] as { id: string; uri: string }[],
  attachments: [] as { id: string }[],
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

// #58: a single instrument tags every untagged piece and session; two instruments leave them alone
const one = migrate(save({ instruments: ['Piano'], pieces: [{ name: 'A', stage: 0 }, { name: 'B', stage: 0, instrument: 'Guitar' }], sessions: [{ id: 's', title: 'A', meta: 'Piece', min: 5, date: '2026-09-01' }] }), seed()) as any;
assert.deepEqual(one.pieces.map((p: any) => p.instrument), ['Piano', 'Guitar']);
assert.equal(one.sessions[0].instrument, 'Piano');
const two = migrate(save({ instruments: ['Piano', 'Guitar'], pieces: [{ name: 'A', stage: 0 }] }), seed()) as any;
assert.equal(two.pieces[0].instrument, undefined);

// #60: a blob from before score attachments, and one with a broken array,
// both have to come back as an empty list rather than undefined
assert.deepEqual((migrate(save({ pieces: [] }), seed()) as any).attachments, []);
assert.deepEqual((migrate(save({ attachments: null }), seed()) as any).attachments, []);
assert.equal((migrate(save({ attachments: [{ id: 'a' }] }), seed()) as any).attachments.length, 1);

// #83: bare technique names become pieces of kind 'Technique'; a name that already
// is a piece is not doubled, blanks are dropped, and the old array is gone
const tech = migrate(save({ pieces: [{ id: 'p1', name: 'Scales & arpeggios', stage: 1 }], techniques: ['Scales & arpeggios', 'Sight reading', ' '] }), seed()) as any;
assert.deepEqual(tech.pieces.map((p: any) => [p.name, p.kind ?? 'Piece']), [['Scales & arpeggios', 'Piece'], ['Sight reading', 'Technique']]);
assert.equal(tech.pieces[1].id, 'tech-sight-reading');
assert.equal('techniques' in tech, false);

// #93: a legacy spot without a box or due date starts in box 0, due on its addedAt
// (or today when even that is missing); a scheduled spot keeps what it has, a
// piece without spots gains none, and a spot's other fields survive untouched
{
  const todayKey = new Date().toISOString().slice(0, 10);
  const m = migrate(
    save({
      pieces: [
        { id: 'p', stage: 0, spots: [{ id: 'a', label: 'bars 12-16', addedAt: '2026-09-01', note: 'slow' }, { id: 'b', label: 'coda', addedAt: '2026-09-10', box: 3, dueAt: '2026-09-30', gradedAt: '2026-09-23' }, { id: 'c', label: 'no date' }] },
        { id: 'q', stage: 0 },
      ],
    }),
    seed(),
  ) as any;
  assert.deepEqual(m.pieces[0].spots[0], { id: 'a', label: 'bars 12-16', addedAt: '2026-09-01', note: 'slow', box: 0, dueAt: '2026-09-01' });
  assert.deepEqual(m.pieces[0].spots[1], { id: 'b', label: 'coda', addedAt: '2026-09-10', box: 3, dueAt: '2026-09-30', gradedAt: '2026-09-23' });
  assert.deepEqual(m.pieces[0].spots[2], { id: 'c', label: 'no date', box: 0, dueAt: todayKey });
  assert.equal('spots' in m.pieces[1], false);
  assert.deepEqual(backfillSpots([{ addedAt: '2026-01-01', box: Number.NaN }], todayKey), [{ addedAt: '2026-01-01', box: 0, dueAt: '2026-01-01' }]);
}

console.log('check-migrate: all assertions passed');
