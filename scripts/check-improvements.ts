// Self-checks for the #16 pure logic: backup format, month heatmap, session
// edits. Run: npm run check:improvements
import assert from 'node:assert/strict';

import { buildCsv, isSafeRelPath, parseBackup } from '../src/lib/backup-math.ts';
import { heatLevel, mix, monthGrid } from '../src/lib/heatmap-math.ts';
import { applySessionUpdate } from '../src/lib/session-math.ts';

// --- backup: path guard — restore must never write outside the documents dir
assert.equal(isSafeRelPath('Audio/rec.m4a'), true);
assert.equal(isSafeRelPath('a..b/rec.m4a'), true); // dots inside a name are fine
assert.equal(isSafeRelPath('../escape.m4a'), false);
assert.equal(isSafeRelPath('a/../../escape.m4a'), false);
assert.equal(isSafeRelPath('/absolute.m4a'), false);
assert.equal(isSafeRelPath('file:///etc/x'), false);
assert.equal(isSafeRelPath(''), false);

// --- backup: CSV quoting round-trips commas, quotes, and newlines
assert.equal(
  buildCsv([
    { date: '2026-08-20', title: 'Clair de Lune', meta: 'Piece', min: 30, note: undefined },
    { date: '2026-08-19', title: 'Scales, arpeggios', meta: 'Technique', min: 15, note: 'said "ok"\ntwice' },
  ]),
  'date,focus,kind,minutes,note\n' +
    '2026-08-20,Clair de Lune,Piece,30,\n' +
    '2026-08-19,"Scales, arpeggios",Technique,15,"said ""ok""\ntwice"',
);

// --- backup: payload validation — junk throws, unsafe/non-string files are dropped
const good = parseBackup(JSON.stringify({ etudeBackup: 1, state: { totalMin: 5 }, files: { 'Audio/a.m4a': 'QQ==', '../x': 'QQ==', bad: 42 } }));
assert.deepEqual(good, { state: { totalMin: 5 }, files: { 'Audio/a.m4a': 'QQ==' } });
assert.deepEqual(parseBackup(JSON.stringify({ etudeBackup: 1, state: {} })).files, {});
for (const bad of ['{}', 'null', '[]', JSON.stringify({ etudeBackup: 2, state: {} }), JSON.stringify({ etudeBackup: 1, state: null }), JSON.stringify({ etudeBackup: 1, state: [] })])
  assert.throws(() => parseBackup(bad));

// --- heatmap: hex mixing
assert.equal(mix('#000000', '#ffffff', 0), '#000000');
assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
assert.equal(mix('#b34a2e', '#faf7f2', 0.5), mix('#faf7f2', '#b34a2e', 0.5));

// --- heatmap: intensity steps (0 / 1–24 / 25–39 / 40+)
assert.deepEqual([0, 1, 24, 25, 39, 40, 300].map(heatLevel), [0, 1, 1, 2, 2, 3, 3]);

// --- heatmap: August 2026 starts on a Saturday, 31 days
const aug = monthGrid(2026, 7, true); // Monday start → 5 leading blanks
assert.deepEqual(aug[0], [null, null, null, null, null, 1, 2]);
assert.equal(aug.length, 6);
assert.deepEqual(aug[5], [31, null, null, null, null, null, null]);
assert.equal(aug.flat().filter((d) => d !== null).length, 31);
const augSun = monthGrid(2026, 7, false); // Sunday start → 6 leading blanks
assert.deepEqual(augSun[0], [null, null, null, null, null, null, 1]);
// Feb 2027 starts on a Monday and has 28 days → a perfect 4-row grid
const feb = monthGrid(2027, 1, true);
assert.equal(feb.length, 4);
assert.deepEqual(feb[0], [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(feb[3], [22, 23, 24, 25, 26, 27, 28]);
// every row is exactly 7 wide
for (const w of [...aug, ...augSun, ...feb]) assert.equal(w.length, 7);

// --- session edits: minutes delta moves totalMin and the day's bucket together
const base = {
  sessions: [
    { id: 'a', title: 'Clair de Lune', meta: 'Piece', min: 30, date: '2026-08-20' },
    { id: 'b', title: 'Scales', meta: 'Technique', min: 10, date: '2026-08-19', note: 'kept' },
  ],
  minutesByDate: { '2026-08-20': 45, '2026-08-19': 10 },
  totalMin: 55,
};
const up = applySessionUpdate(base, 'a', { min: 45, title: 'Arabesque', meta: 'Piece', note: '  ' });
assert.equal(up.totalMin, 70);
assert.equal(up.minutesByDate['2026-08-20'], 60);
assert.equal(up.sessions[0].title, 'Arabesque');
assert.equal(up.sessions[0].note, undefined); // blank note clears
assert.equal(up.sessions[1].note, 'kept'); // untouched session untouched
const down = applySessionUpdate(base, 'a', { min: 5 });
assert.equal(down.totalMin, 30);
assert.equal(down.minutesByDate['2026-08-20'], 20);
// no min in the patch → totals untouched, buckets object reused
const noteOnly = applySessionUpdate(base, 'b', { note: ' hi ' });
assert.equal(noteOnly.totalMin, 55);
assert.equal(noteOnly.minutesByDate, base.minutesByDate);
assert.equal(noteOnly.sessions[1].note, 'hi');
// unknown id → state returned as-is
assert.equal(applySessionUpdate(base, 'zzz', { min: 99 }), base);
// deltas can never drive a bucket or the total negative
const clamp = applySessionUpdate({ ...base, minutesByDate: { '2026-08-20': 10 }, totalMin: 10 }, 'a', { min: 1 });
assert.equal(clamp.totalMin, 0);
assert.equal(clamp.minutesByDate['2026-08-20'], 0);

console.log('check-improvements: all assertions passed');
