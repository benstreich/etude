// The clean-pass ladder (#90): counting, resetting, and the two ceilings it
// must never climb past.
import assert from 'node:assert';

import { ladderStep, LADDER_DEFAULTS, resolveLadder, type LadderEvent, type LadderState } from '../src/lib/ladder-math.ts';
import { MAX_BPM } from '../src/lib/metronome-math.ts';

const CFG = { need: 3, step: 4, target: 200 };
/** Replay a run of events from one starting state, returning every step. */
const run = (start: LadderState, events: LadderEvent[], cfg = CFG) => {
  const steps = [];
  let s = start;
  for (const e of events) {
    const r = ladderStep(s, e, cfg);
    steps.push(r);
    s = { tally: r.tally, bpm: r.bpm };
  }
  return steps;
};
const final = (start: LadderState, events: LadderEvent[], cfg = CFG) =>
  run(start, events, cfg).at(-1) ?? { ...start, advanced: false, reachedTarget: false };

// --- defaults ---

assert.deepEqual(resolveLadder(), LADDER_DEFAULTS, 'an unconfigured piece gets the defaults');
assert.deepEqual(resolveLadder({ on: true }), { ...LADDER_DEFAULTS, on: true }, 'partial config keeps the rest');
assert.deepEqual(resolveLadder({ need: 5, step: 2, on: true }), { on: true, need: 5, step: 2 });
assert.deepEqual(LADDER_DEFAULTS, { on: false, need: 3, step: 4 }, 'off until asked for');

// --- counting up ---

{
  const steps = run({ tally: 0, bpm: 100 }, ['pass', 'pass', 'pass']);
  assert.deepEqual(steps.map((r) => r.tally), [1, 2, 0], 'the tally resets on the advance');
  assert.deepEqual(steps.map((r) => r.advanced), [false, false, true]);
  assert.deepEqual(steps.map((r) => r.bpm), [100, 100, 104], 'only the third pass moves the tempo');
  assert.equal(steps[2]!.reachedTarget, false, '104 is nowhere near the 200 target');
}

// need = 1 advances on every pass
{
  const steps = run({ tally: 0, bpm: 100 }, ['pass', 'pass'], { need: 1, step: 5, target: 200 });
  assert.deepEqual(steps.map((r) => r.bpm), [105, 110]);
  assert.deepEqual(steps.map((r) => r.advanced), [true, true]);
}

// --- resetting ---

{
  const r = final({ tally: 2, bpm: 100 }, ['miss']);
  assert.deepEqual([r.tally, r.bpm, r.advanced], [0, 100, false], 'a miss resets and moves nothing');
}
{
  const r = final({ tally: 2, bpm: 100 }, ['manual-bpm']);
  assert.deepEqual([r.tally, r.bpm, r.advanced], [0, 100, false], 'so does moving the tempo by hand');
}
// two passes, a miss, then three more: exactly one advance, and it is the last step
{
  const steps = run({ tally: 0, bpm: 100 }, ['pass', 'pass', 'miss', 'pass', 'pass', 'pass']);
  assert.equal(steps.filter((r) => r.advanced).length, 1);
  assert.equal(steps.at(-1)!.advanced, true);
  assert.equal(steps.at(-1)!.bpm, 104, 'the reps before the miss did not count towards the bump');
}

// --- the target ceiling ---

// the last step lands exactly on the target rather than overshooting it
{
  const r = final({ tally: 2, bpm: 118 }, ['pass'], { need: 3, step: 4, target: 120 });
  assert.deepEqual([r.bpm, r.advanced, r.reachedTarget], [120, true, true], '118 + 4 clamps to the 120 target');
}
// a step that lands on the target exactly still announces it
{
  const r = final({ tally: 2, bpm: 116 }, ['pass'], { need: 3, step: 4, target: 120 });
  assert.deepEqual([r.bpm, r.reachedTarget], [120, true]);
}
// at the target the tally still fills — the control stays live — but nothing moves
{
  const steps = run({ tally: 0, bpm: 120 }, ['pass', 'pass', 'pass', 'pass'], { need: 3, step: 4, target: 120 });
  assert.deepEqual(steps.map((r) => r.bpm), [120, 120, 120, 120], 'no bumps past the target');
  assert.deepEqual(steps.map((r) => r.advanced), [false, false, false, false]);
  assert.deepEqual(steps.map((r) => r.tally), [1, 2, 3, 3], 'the tally fills and stays full, never past `need`');
}
// above the target (a target lowered after the fact) behaves the same way
{
  const r = final({ tally: 2, bpm: 140 }, ['pass'], { need: 3, step: 4, target: 120 });
  assert.deepEqual([r.bpm, r.advanced], [140, false]);
}

// --- the hard ceiling ---

{
  const r = final({ tally: 2, bpm: MAX_BPM - 2 }, ['pass'], { need: 3, step: 4, target: 400 });
  assert.deepEqual([r.bpm, r.advanced, r.reachedTarget], [MAX_BPM, true, true], 'MAX_BPM is a ceiling too');
}
{
  const r = final({ tally: 2, bpm: MAX_BPM }, ['pass'], { need: 3, step: 4, target: 400 });
  assert.equal(r.advanced, false, 'nothing climbs past MAX_BPM');
}
// a missing/zero target falls back to the hard ceiling rather than pinning at 0
{
  const r = final({ tally: 2, bpm: 100 }, ['pass'], { need: 3, step: 4, target: 0 });
  assert.deepEqual([r.bpm, r.advanced], [104, true]);
}

// --- invariants over a long random-ish run ---
{
  const cfg = { need: 3, step: 4, target: 140 };
  let s: LadderState = { tally: 0, bpm: 100 };
  const events: LadderEvent[] = ['pass', 'pass', 'miss', 'pass', 'pass', 'pass', 'pass', 'manual-bpm', 'pass', 'pass', 'pass'];
  for (const e of events) {
    const r = ladderStep(s, e, cfg);
    assert.ok(r.tally >= 0 && r.tally <= cfg.need, `tally out of range: ${r.tally}`);
    assert.ok(r.bpm >= 100 && r.bpm <= cfg.target, `bpm left its bounds: ${r.bpm}`);
    assert.ok(r.bpm >= s.bpm, 'the ladder never goes down');
    if (r.advanced) assert.equal(r.tally, 0, 'an advance always resets the tally');
    s = { tally: r.tally, bpm: r.bpm };
  }
}

console.log('ladder ok');
