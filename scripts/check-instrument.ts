// A piece can be played on several instruments; untagged means all of them.
import assert from 'node:assert';

import { instrumentChoices, instrumentLabel, onInstrument, pieceInstruments, toggleInstrument } from '../src/lib/instrument-math.ts';

// reading the set, old field and new
assert.deepEqual(pieceInstruments({}), []);
assert.deepEqual(pieceInstruments({ instrument: 'Guitar' }), ['Guitar']);
assert.deepEqual(pieceInstruments({ instruments: ['Guitar', 'Violin'] }), ['Guitar', 'Violin']);
// `instruments` wins when both are present, including when it is deliberately empty
assert.deepEqual(pieceInstruments({ instrument: 'Guitar', instruments: ['Violin'] }), ['Violin']);
assert.deepEqual(pieceInstruments({ instrument: 'Guitar', instruments: [] }), []);

// the All filter shows everything, and an untagged piece shows under every instrument
assert.equal(onInstrument({}, ''), true);
assert.equal(onInstrument({ instrument: 'Guitar' }, ''), true);
assert.equal(onInstrument({}, 'Cello'), true);
assert.equal(onInstrument({ instruments: [] }, 'Cello'), true);
// a tagged piece shows only where it belongs — this is the Cello/techniques bug
assert.equal(onInstrument({ instrument: 'Guitar' }, 'Cello'), false);
assert.equal(onInstrument({ instrument: 'Guitar' }, 'Guitar'), true);
// and the whole point: one piece, two instruments
assert.equal(onInstrument({ instruments: ['Guitar', 'Violin'] }, 'Guitar'), true);
assert.equal(onInstrument({ instruments: ['Guitar', 'Violin'] }, 'Violin'), true);
assert.equal(onInstrument({ instruments: ['Guitar', 'Violin'] }, 'Cello'), false);

assert.equal(instrumentLabel({}), '');
assert.equal(instrumentLabel({ instrument: 'Guitar' }), 'Guitar');
assert.equal(instrumentLabel({ instruments: ['Guitar', 'Violin'] }), 'Guitar · Violin');

// toggling adds, removes, and keeps `instrument` pointing at the first
assert.deepEqual(toggleInstrument({ instrument: 'Guitar' }, 'Violin'), { instruments: ['Guitar', 'Violin'], instrument: 'Guitar' });
assert.deepEqual(toggleInstrument({ instruments: ['Guitar', 'Violin'] }, 'Guitar'), { instruments: ['Violin'], instrument: 'Violin' });
assert.deepEqual(toggleInstrument({ instrument: 'Guitar' }, 'Guitar'), { instruments: [], instrument: undefined });
assert.deepEqual(toggleInstrument({}, 'Cello'), { instruments: ['Cello'], instrument: 'Cello' });
// toggling twice is a no-op in meaning, whatever the order
const once = toggleInstrument({ instruments: ['Guitar'] }, 'Violin');
assert.deepEqual(toggleInstrument(once, 'Violin').instruments, ['Guitar']);

// which instrument a session counts towards: only ask when the answer is genuinely
// ambiguous, or the picker turns into a toll booth on every single session
const both = { instruments: ['Guitar', 'Violin'] };
assert.deepEqual(instrumentChoices(both, ''), ['Guitar', 'Violin']); // two tags, no tab — ask
assert.deepEqual(instrumentChoices(both, 'Guitar'), []); // the tab in view already answered
assert.deepEqual(instrumentChoices({ instrument: 'Guitar' }, ''), []); // one tag, nothing to ask
assert.deepEqual(instrumentChoices({}, ''), []); // untagged counts everywhere
assert.deepEqual(instrumentChoices({ instruments: [] }, ''), []);
assert.deepEqual(instrumentChoices(undefined, ''), []); // a focus with no piece record
// three is still a question, and the order is the piece's own
assert.deepEqual(instrumentChoices({ instruments: ['Cello', 'Bass', 'Violin'] }, ''), ['Cello', 'Bass', 'Violin']);
// the old single field reads the same as a one-entry set
assert.deepEqual(instrumentChoices({ instrument: 'Guitar', instruments: ['Guitar', 'Violin'] }, ''), ['Guitar', 'Violin']);

console.log('instrument ok');
