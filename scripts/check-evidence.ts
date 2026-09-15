// The reading list ships citations, so the check is about honesty, not maths:
// every entry needs a real source with a year and an https link, every claim
// needs prose in both locales, and anything flagged `contested` must carry the
// caveat that says why. Orphan locale entries fail too, so a deleted study
// cannot leave its copy behind.
import assert from 'node:assert';

import de from '../src/locales/de.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import { ENTRIES, GROUPS, type StatHook } from '../src/lib/evidence.ts';

const STAT_HOOKS: StatHook[] = ['interleaving', 'spacing', 'sessionLength'];
const THIS_YEAR = new Date().getFullYear();

const ids = ENTRIES.map((e) => e.id);
assert.equal(new Set(ids).size, ids.length, `duplicate entry id: ${ids.join(', ')}`);
assert.ok(ENTRIES.length >= 10, 'a reading list under ten entries is not worth a tab');

for (const e of ENTRIES) {
  assert.ok(GROUPS.includes(e.group), `${e.id}: unknown group ${e.group}`);
  assert.ok(e.sources.length >= 1, `${e.id}: no source`);
  if (e.stat) assert.ok(STAT_HOOKS.includes(e.stat), `${e.id}: unknown stat hook ${e.stat}`);
  // A contested claim without its counter-evidence is the thing this file exists to stop.
  if (e.contested) assert.ok(e.caveat, `${e.id}: contested but has no caveat`);

  for (const src of e.sources) {
    assert.ok(src.authors.trim().length > 2, `${e.id}: source needs authors`);
    assert.ok(src.title.trim().length > 10, `${e.id}: source needs a full title`);
    assert.ok(src.where.trim().length > 5, `${e.id}: source needs a journal or publisher`);
    assert.ok(src.year >= 1900 && src.year <= THIS_YEAR, `${e.id}: implausible year ${src.year}`);
    assert.ok(src.url.startsWith('https://'), `${e.id}: ${src.url} is not an https link`);
    assert.ok(!/example\.com|TODO|localhost/i.test(src.url), `${e.id}: placeholder url`);
  }
}

// A contested entry in every group would be odd; none at all would be dishonest.
assert.ok(ENTRIES.some((e) => e.contested), 'no contested entry — the counter-evidence went missing');

for (const [lang, dict] of [['en', en], ['de', de]] as const) {
  const learn = (dict as Record<string, any>).learn;
  assert.ok(learn, `${lang}: no learn section`);
  for (const key of ['title', 'back', 'intro', 'groupPractice', 'groupLearning', 'groupPeople', 'contested', 'free', 'yours', 'statInterleaving', 'statSpacing', 'statSessionLength']) {
    assert.ok(typeof learn[key] === 'string' && learn[key].length > 0, `${lang}: learn.${key} missing`);
  }
  assert.ok(typeof (dict as Record<string, any>).tools.learn === 'string', `${lang}: tools.learn missing`);

  for (const e of ENTRIES) {
    const copy = learn.e?.[e.id];
    assert.ok(copy, `${lang}: no copy for entry ${e.id}`);
    assert.ok(typeof copy.takeaway === 'string' && copy.takeaway.length > 10, `${lang}: ${e.id}.takeaway too short`);
    assert.ok(typeof copy.finding === 'string' && copy.finding.length > 40, `${lang}: ${e.id}.finding too short`);
    assert.equal(!!copy.caveat, !!e.caveat, `${lang}: ${e.id} caveat flag and copy disagree`);
    if (e.caveat) assert.ok(copy.caveat.length > 40, `${lang}: ${e.id}.caveat too short`);
  }

  const orphans = Object.keys(learn.e ?? {}).filter((k) => !ids.includes(k));
  assert.deepEqual(orphans, [], `${lang}: copy left behind for removed entries: ${orphans.join(', ')}`);
}

console.log(`check-evidence ok — ${ENTRIES.length} entries, ${ENTRIES.reduce((a, e) => a + e.sources.length, 0)} sources, ${ENTRIES.filter((e) => e.contested).length} flagged contested`);
