// The backup's pure half: what is accepted as a backup, which files travel, and
// which entries of an untrusted archive may be written back under Documents.
import assert from 'node:assert/strict';

import { backupFiles, isBackupZip, isSafeRelPath, parseBackup, restorePlan, spaceForBackup, spaceForRestore, staleCacheEntries, STATE_FILE, toMb } from '../src/lib/backup-math.ts';

// --- parseBackup: both versions in, garbage out ----------------------------
const v1 = parseBackup(JSON.stringify({ etudeBackup: 1, state: { sessions: [] }, files: { 'Audio/a.m4a': 'AAAA', '../etc/passwd': 'x', '/abs': 'x', 'c:/win': 'x', 'ok/but': 7 } }));
assert.deepEqual(v1.state, { sessions: [] });
assert.deepEqual(Object.keys(v1.files), ['Audio/a.m4a'], 'unsafe or non-string entries are dropped, not fixed');

const v2 = parseBackup(JSON.stringify({ etudeBackup: 2, state: { sessions: [] } }));
assert.deepEqual(v2, { state: { sessions: [] }, files: {} }, 'a zip backup carries no embedded files');
// a v2 that smuggles a files map is still read as having none
assert.deepEqual(parseBackup(JSON.stringify({ etudeBackup: 2, state: {}, files: { 'Audio/a.m4a': 'AAAA' } })).files, {});

for (const bad of ['null', '[]', '"x"', '{}', '{"etudeBackup":3,"state":{}}', '{"etudeBackup":1}', '{"etudeBackup":1,"state":null}', '{"etudeBackup":2,"state":[]}', '{"etudeBackup":"1","state":{}}'])
  assert.throws(() => parseBackup(bad), /not a backup/, `should reject ${bad}`);
assert.throws(() => parseBackup('{truncated'), 'invalid JSON throws too; the caller toasts');

// --- backupFiles: each once, documents-relative only -----------------------
assert.deepEqual(backupFiles(['Audio/a.m4a', 'Audio/a.m4a', 'attachments/p/1.jpg', 'blob:abc', 'file:///x', undefined, 7, '', '../up']), ['Audio/a.m4a', 'attachments/p/1.jpg']);

// --- restorePlan: zip-slip and the state file never reach Documents -------
assert.deepEqual(
  restorePlan([STATE_FILE, './Audio/a.m4a', 'Audio/a.m4a', 'imported/x.mp3', 'attachments/p/1.jpg', '../../etc/passwd', '/etc/passwd', 'c:/windows', 'a\\b', 'Audio/', 'sub/../x', '']),
  ['Audio/a.m4a', 'imported/x.mp3', 'attachments/p/1.jpg'],
);
assert.deepEqual(restorePlan([]), []);
assert.deepEqual(restorePlan([STATE_FILE]), [], 'a state-only archive restores no files');

// --- isSafeRelPath ----------------------------------------------------------
for (const ok of ['Audio/a.m4a', 'a', 'attachments/p q/1.jpg', 'ExpoAudio/r.caf']) assert.equal(isSafeRelPath(ok), true, ok);
for (const bad of ['', '/a', 'a/../b', '..', 'c:/a', 'file://a', 'a\\b']) assert.equal(isSafeRelPath(bad), false, bad);

// --- isBackupZip: by extension or by what the picker reports ---------------
assert.equal(isBackupZip('etude-backup-2026-10-05.zip', undefined), true);
assert.equal(isBackupZip('etude-backup-2026-10-05.ZIP', 'application/octet-stream'), true);
assert.equal(isBackupZip('backup', 'application/x-zip-compressed'), true);
assert.equal(isBackupZip('etude-backup-2026-09-17.json', 'application/json'), false);
assert.equal(isBackupZip(undefined, undefined), false);


// --- free space: a 317 MB library needs room for the staged copy and the archive
const MB = 1024 * 1024;
assert.equal(spaceForBackup(317 * MB), 684 * MB, 'twice the media plus 50 MB headroom');
assert.equal(spaceForRestore(317 * MB), 684 * MB);
assert.equal(spaceForBackup(0), 50 * MB, 'an empty library still keeps the headroom');
assert.equal(toMb(684 * MB), 684);
assert.equal(toMb(MB + 1), 2, 'rounded up: never promise less than is needed');

// --- cache cleanup at launch: staging dirs always, archives once a day old
const now = Date.parse('2026-10-08T12:00:00Z');
const day = 86400000;
assert.deepEqual(
  staleCacheEntries(
    [
      { name: 'backup-2026-10-07', dir: true, mtime: now },
      { name: 'restore-ab12cd34', dir: true, mtime: null },
      { name: 'etude-backup-2026-10-06.zip', dir: false, mtime: now - 2 * day },
      { name: 'etude-backup-2026-10-08.zip', dir: false, mtime: now - 60000 },
      { name: 'etude-backup-old.zip', dir: false, mtime: null },
      { name: 'etude-sessions-2026-10-01.csv', dir: false, mtime: now - 9 * day },
      { name: 'ImagePicker', dir: true, mtime: now - 9 * day },
    ],
    now,
  ),
  ['backup-2026-10-07', 'restore-ab12cd34', 'etude-backup-2026-10-06.zip'],
  'a fresh archive may still be read by a share target; other apps’ cache is not ours to sweep',
);
console.log('check-backup ok');
