// Every instrument the app offers must land on a cue voice, and the ones whose
// names overlap ("Bass Clarinet" vs "Bass Guitar") must land on the right one.
import assert from 'node:assert';

import { cueVoice, primaryOf } from '../src/lib/cue-voice.ts';
import { ALL_INSTRUMENTS } from '../src/lib/instruments.ts';

assert.equal(cueVoice('Piano'), 'mallet'); // keys and anything unmapped
assert.equal(cueVoice('Marimba'), 'mallet');
assert.equal(cueVoice('Guitar'), 'pluck');
assert.equal(cueVoice('Bass Guitar'), 'pluck');
assert.equal(cueVoice('Electric Bass'), 'pluck');
assert.equal(cueVoice('Bass Clarinet'), 'bow'); // not a plucked "bass"
assert.equal(cueVoice('Double Bass'), 'bow');
assert.equal(cueVoice('Violin'), 'bow');
assert.equal(cueVoice('Voice'), 'bow');
assert.equal(cueVoice('Drums'), 'perc');
assert.equal(cueVoice('Steel Drum'), 'perc');
assert.equal(cueVoice('Tabla'), 'perc');
assert.equal(cueVoice('Kazoo'), 'mallet'); // free-typed instrument
assert.equal(cueVoice(''), 'mallet');
assert.equal(cueVoice(undefined), 'mallet');

// no instrument may crash or return something the sample map has no key for
const VOICES = ['mallet', 'pluck', 'bow', 'perc'];
for (const inst of ALL_INSTRUMENTS) {
  assert.ok(VOICES.includes(cueVoice(inst)), `${inst} → ${cueVoice(inst)}`);
  assert.equal(cueVoice(inst), cueVoice(inst.toUpperCase()), `${inst} is case-sensitive`);
}

// the chosen primary survives; a removed one falls back to the first
assert.equal(primaryOf(['Piano', 'Guitar'], 'Guitar'), 'Guitar');
assert.equal(primaryOf(['Piano', 'Guitar'], 'Cello'), 'Piano');
assert.equal(primaryOf(['Piano', 'Guitar'], ''), 'Piano');
assert.equal(primaryOf([], 'Cello'), '');

console.log('cue voice ok — %d instruments mapped', ALL_INSTRUMENTS.length);
