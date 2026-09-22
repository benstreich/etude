// Self-check for the pure session-edit math. Run: npm run check:session
import assert from 'node:assert/strict';

import { applySessionUpdate, LIVE_GRACE_MS, restoreLive } from '../src/lib/session-math.ts';

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

// --- restoreLive: a killed app must not lose the running session, and a
// long-dead one must not claim the gap was practised -----------------------
const t0 = Date.parse('2026-09-20T10:00:00Z');

// paused at death → still paused, minutes intact
assert.deepEqual(restoreLive({ startedAt: null, accum: 300, lastSeen: t0 }, t0 + 999999), { accum: 300, startedAt: null });

// a brief death: the clock kept running straight through it
const brief = restoreLive({ startedAt: t0, accum: 60, lastSeen: t0 + 50000 }, t0 + 50000 + LIVE_GRACE_MS);
assert.deepEqual(brief, { accum: 60, startedAt: t0 });

// the bug: screen off 49 s in froze the heartbeat, Android killed the app, the
// player came back 23 minutes later — the clock must read 23 minutes and run
{
  const back = restoreLive({ startedAt: t0, accum: 0, lastSeen: t0 + 49000 }, t0 + 23 * 60000);
  assert.deepEqual(back, { accum: 0, startedAt: t0 });
  assert.equal(Math.round((t0 + 23 * 60000 - back.startedAt! ) / 60000), 23);
}
// the window covers a long practice stretch, not just a crash
assert.ok(LIVE_GRACE_MS >= 3 * 3600000);

// one ms past the grace: banked up to the last heartbeat, comes back paused
const late = restoreLive({ startedAt: t0, accum: 60, lastSeen: t0 + 50000 }, t0 + 50001 + LIVE_GRACE_MS);
assert.deepEqual(late, { accum: 110, startedAt: null }); // 60 banked + 50s seen running

// an app killed overnight: eight hours of sleep are not practice
const night = restoreLive({ startedAt: t0, accum: 0, lastSeen: t0 + 120000 }, t0 + 8 * 3600000);
assert.deepEqual(night, { accum: 120, startedAt: null });

// a heartbeat that predates the start (clock skew, restored backup) clamps at 0
assert.deepEqual(restoreLive({ startedAt: t0, accum: 30, lastSeen: t0 - 5000 }, t0 + 2 * LIVE_GRACE_MS), { accum: 30, startedAt: null });

console.log('check-session: all assertions passed');
