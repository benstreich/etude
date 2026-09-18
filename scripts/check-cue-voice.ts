// Every instrument the app offers must land on a cue voice, and the ones whose
// names overlap ("Bass Clarinet" vs "Bass Guitar") must land on the right one.
import assert from 'node:assert';

import { cueAllowed, CUE_GAP_MS, cueVoice, primaryOf } from '../src/lib/cue-voice.ts';
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

// --- when the cue may sound -------------------------------------------
// One saved session, one cue. It has doubled twice now — a review effect that
// ran again, and a rewind that landed while the sample was still playing — so
// the rule the player is behind is worth pinning down.
const cue = (over: Partial<Parameters<typeof cueAllowed>[0]> = {}) =>
  cueAllowed({ enabled: true, metronomeRunning: false, lastPlay: 0, now: 100_000, ...over });

assert.equal(cue(), true);
assert.equal(cue({ enabled: false }), false, 'Sounds off means silent');
assert.equal(cue({ metronomeRunning: true }), false, 'a cue must never talk over the click');

// the window: a second call inside it is the same moment arriving twice
assert.equal(cue({ lastPlay: 100_000 }), false, 'the same instant');
assert.equal(cue({ lastPlay: 100_000 - CUE_GAP_MS + 1 }), false, 'just inside the window');
assert.equal(cue({ lastPlay: 100_000 - CUE_GAP_MS }), true, 'the window is closed at exactly the gap');
assert.equal(cue({ lastPlay: 100_000 - CUE_GAP_MS - 1 }), true);

// a cue that never played is not a cue that played at time zero
assert.equal(cueAllowed({ enabled: true, metronomeRunning: false, lastPlay: 0, now: CUE_GAP_MS }), true);
// and the gates come first: inside the window or not, a running metronome wins
assert.equal(cue({ metronomeRunning: true, lastPlay: 0 }), false);

console.log('cue voice ok — %d instruments mapped', ALL_INSTRUMENTS.length);
