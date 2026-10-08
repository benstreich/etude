// The repertoire bar must agree with the stage label on any number of stages.
import assert from 'node:assert';

import { localizeDefaultStages, stagePct, stageRemap } from '../src/lib/stage-math.ts';

// clearing a middle stage moves later pieces down with it, not a stage ahead
assert.deepEqual(stageRemap(['Learning', '', 'Polishing', 'Ready']), [0, 0, 1, 2]);
assert.deepEqual(stageRemap(['', 'Memorizing', 'Ready']), [0, 0, 1], 'a removed first stage falls to the new first');
assert.deepEqual(stageRemap(['Learning', 'Ready', '  ']), [0, 1, 1], 'a removed last stage falls to the one before');
assert.deepEqual(stageRemap(['A', 'B', 'C', 'D']), [0, 1, 2, 3], 'nothing removed is the identity');

assert.equal(stagePct(0, 3), 20); // first stage always reads the same sliver
assert.equal(stagePct(1, 3), 67);
assert.equal(stagePct(2, 3), 100); // last stage is "ready"
assert.equal(stagePct(1, 4), 50);
assert.equal(stagePct(3, 4), 100);
assert.equal(stagePct(9, 3), 100); // a dangling index from a shortened stage list
assert.equal(stagePct(-1, 3), 20);

// monotonic, bounded, and the last stage is always 100 — whatever the list length
for (let n = 2; n <= 8; n++) {
  let prev = 0;
  for (let stage = 0; stage < n; stage++) {
    const pct = stagePct(stage, n);
    assert.ok(pct >= prev, `stage ${stage}/${n} went backwards`);
    assert.ok(pct > 0 && pct <= 100, `stage ${stage}/${n} out of range: ${pct}`);
    prev = pct;
  }
  assert.equal(stagePct(n - 1, n), 100, `last of ${n} stages should read ready`);
}

console.log('stage ok');

// default stage names follow the language until the user makes them their own
{
  const en = ['Learning', 'Polishing', 'Ready'];
  const de = ['Einstudieren', 'Ausfeilen', 'Bühnenreif'];
  assert.deepEqual(localizeDefaultStages(en, [en, de], de), de, 'English defaults become German');
  assert.deepEqual(localizeDefaultStages(de, [en, de], en), en, 'and back on a switch');
  const same = localizeDefaultStages(de, [en, de], de);
  assert.equal(same, localizeDefaultStages(same, [en, de], de), 'already localized: same reference, no write');
  const own = ['Learning', 'Polishing', 'Gig-ready'];
  assert.equal(localizeDefaultStages(own, [en, de], de), own, 'a renamed stage is the user’s, never touched');
  const four = [...en, 'Memorized'];
  assert.equal(localizeDefaultStages(four, [en, de], de), four, 'an added stage too');
}
