// Self-check for the pure session-edit math. Run: npm run check:session
import assert from 'node:assert/strict';

import { applySessionUpdate } from '../src/lib/session-math.ts';

const base = () => ({
  sessions: [
    { id: 'a', title: 'Nocturne', meta: 'Piece', min: 30, date: '2026-08-20' },
    { id: 'b', title: 'Scales', meta: 'Technique', min: 15, date: '2026-08-20', note: 'slow' },
    { id: 'c', title: 'Etude', meta: 'Piece', min: 20, date: '2026-08-19' },
  ],
  minutesByDate: { '2026-08-20': 45, '2026-08-19': 20 },
  totalMin: 65,
});

// raising minutes moves the day and the total by the same delta
let s = applySessionUpdate(base(), 'a', { min: 50 });
assert.equal(s.totalMin, 85);
assert.equal(s.minutesByDate['2026-08-20'], 65);
assert.equal(s.sessions.find((x) => x.id === 'a')!.min, 50);

// lowering works too, and the sibling session on the same day is untouched
s = applySessionUpdate(base(), 'a', { min: 10 });
assert.equal(s.totalMin, 45);
assert.equal(s.minutesByDate['2026-08-20'], 25);
assert.equal(s.sessions.find((x) => x.id === 'b')!.min, 15);

// day and total clamp at 0 rather than going negative on inconsistent state
s = applySessionUpdate({ ...base(), minutesByDate: { '2026-08-20': 5 }, totalMin: 5 }, 'a', { min: 1 });
assert.equal(s.totalMin, 0);
assert.equal(s.minutesByDate['2026-08-20'], 0);

// a title/meta/note-only patch leaves every total alone (same day-map reference)
const noMin = base();
s = applySessionUpdate(noMin, 'b', { title: 'Arpeggios', note: '  faster  ' });
assert.equal(s.totalMin, 65);
assert.equal(s.minutesByDate, noMin.minutesByDate);
assert.equal(s.sessions.find((x) => x.id === 'b')!.title, 'Arpeggios');
assert.equal(s.sessions.find((x) => x.id === 'b')!.note, 'faster'); // trimmed

// a blank note clears it; an omitted note keeps the old one
s = applySessionUpdate(base(), 'b', { note: '   ' });
assert.equal(s.sessions.find((x) => x.id === 'b')!.note, undefined);
s = applySessionUpdate(base(), 'b', { min: 16 });
assert.equal(s.sessions.find((x) => x.id === 'b')!.note, 'slow');

// unknown id is a strict no-op (same object back)
const b = base();
assert.equal(applySessionUpdate(b, 'nope', { min: 99 }), b);

console.log('check-session: all assertions passed');
