// Backup / restore / CSV export for the "Your data" settings section.
//
// A backup is one zip: `state.json` plus every recording and score page at its
// documents-relative path, zipped natively (react-native-zip-archive), so the
// audio never passes through JS and there is no size cap. The previous format,
// one JSON file with the files embedded as base64, is still read on restore so
// backups people already made keep working; it is only written where the zip
// module is missing (Expo Go, web).
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { autoBackupDate, autoBackupPlan, backupFiles, buildCsv, isBackupZip, parseBackup, restorePlan, spaceForBackup, spaceForRestore, staleCacheEntries, STATE_FILE, toMb } from './backup-math';
import type { Session } from './store';
import { dateKey } from './streak-math';

// ponytail: required in try/catch like expo-notifications in reminders.ts, so a
// runtime without the native half (Expo Go, web) falls back instead of crashing
let Zip: typeof import('react-native-zip-archive') | null = null;
try {
  Zip = require('react-native-zip-archive');
} catch {
  Zip = null;
}
const zipAvailable = () => !!Zip && Platform.OS !== 'web' && Constants.appOwnership !== 'expo';

// The legacy JSON path holds everything in memory as base64 and then copies it
// again by stringify; past this the app can run out of memory and die without a
// toast. Thrown as BACKUP_TOO_LARGE so the caller can say so instead. The zip
// path has no such limit.
const MAX_FILE_BYTES = 150 * 1024 * 1024;
export const BACKUP_TOO_LARGE = 'backup-too-large';

// Thrown before a zip backup or restore starts when the phone is short of room for
// it, with the megabytes it needs in `mb`, instead of failing halfway through a copy.
export const BACKUP_NO_SPACE = 'backup-no-space';
const ensureSpace = (needed: number) => {
  if (Paths.availableDiskSpace < needed) throw Object.assign(new Error(BACKUP_NO_SPACE), { mb: toMb(needed) });
};

const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const shareFile = async (name: string, content: string, mimeType: string) => {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType });
};

/** The directory part of a documents-relative path, created when missing. */
const ensureParent = (root: Directory, rel: string) => {
  const cut = rel.lastIndexOf('/');
  if (cut > 0) new Directory(root, rel.slice(0, cut)).create({ intermediates: true, idempotent: true });
};

const tryDelete = (f: File | Directory | null | undefined) => {
  try {
    if (f?.exists) f.delete();
  } catch {
    // a leftover in the cache dir is the OS's to reclaim
  }
};

// a second tap while one export is still encoding would start a second one and a second share sheet
let exporting = false;
/**
 * One file: the state plus every attached file (recordings and score pages) at
 * its documents-relative path. A zip wherever the native module exists; the
 * legacy base64 JSON otherwise.
 */
export async function exportBackup(state: object, paths: string[]) {
  if (exporting) return;
  exporting = true;
  try {
    if (zipAvailable()) await writeZipBackup(state, paths);
    else await writeJsonBackup(state, paths);
  } finally {
    exporting = false;
  }
}

async function writeZipBackup(state: object, paths: string[]) {
  const date = dateKey();
  const staging = new Directory(Paths.cache, `backup-${date}`);
  const archive = new File(Paths.cache, `etude-backup-${date}.zip`);
  try {
    tryDelete(staging);
    const found = backupFiles(paths)
      .map((rel) => [rel, new File(Paths.document, rel)] as const)
      .filter(([, f]) => f.exists);
    ensureSpace(spaceForBackup(found.reduce((n, [, f]) => n + (f.size ?? 0), 0)));
    staging.create({ intermediates: true });
    new File(staging, STATE_FILE).write(JSON.stringify({ etudeBackup: 2, state }));
    for (const [rel, src] of found) {
      ensureParent(staging, rel);
      src.copy(new File(staging, rel));
    }
    // last time's archive would otherwise sit in the cache beside this one
    for (const f of Paths.cache.list()) if (f instanceof File && /^etude-backup-.*\.zip$/.test(f.name)) tryDelete(f);
    await Zip!.zip(staging.uri, archive.uri);
    await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } finally {
    tryDelete(staging);
  }
}

async function writeJsonBackup(state: object, paths: string[]) {
  const found: [string, File][] = [];
  let bytes = 0;
  for (const rel of backupFiles(paths)) {
    const f = new File(Paths.document, rel);
    if (!f.exists) continue;
    found.push([rel, f]);
    bytes += f.size ?? 0;
  }
  // checked before reading anything, so a too-big library costs no memory at all
  if (bytes > MAX_FILE_BYTES) throw new Error(BACKUP_TOO_LARGE);
  const files: Record<string, string> = {};
  for (const [rel, f] of found) files[rel] = await f.base64();
  await shareFile(`etude-backup-${dateKey()}.json`, JSON.stringify({ etudeBackup: 1, state, files }), 'application/json');
}

export async function exportCsv(sessions: Session[]) {
  // the BOM is what makes Excel read the file as UTF-8 — without it umlauts garble
  await shareFile(`etude-sessions-${dateKey()}.csv`, '﻿' + buildCsv(sessions), 'text/csv');
}

/**
 * A picked backup, parsed but not yet applied. `files` holds a legacy backup's
 * embedded base64; `dir` is the unzipped staging directory of a zip backup,
 * which the caller applies with restoreDir and must discard afterwards.
 */
export type PickedBackup = { state: object; files: Record<string, string>; dir?: Directory };

/**
 * Picks a backup file (zip, or the legacy JSON) and returns its parsed payload,
 * or null when the user cancels. Throws on a file that isn't an Étude backup;
 * the caller toasts. Applying it is a separate, confirmed step.
 */
export async function pickBackup(): Promise<PickedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/json', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const picked = new File(asset.uri);
  try {
    if (!isBackupZip(asset.name, asset.mimeType)) {
      // base64 grows files by a third; a file past what the JSON export would write is not read at all
      if ((asset.size ?? 0) > MAX_FILE_BYTES * 1.4) throw new Error(BACKUP_TOO_LARGE);
      return parseBackup(await picked.text());
    }
    if (!zipAvailable()) throw new Error('not a backup'); // Expo Go / web cannot open a zip
    ensureSpace(spaceForRestore(asset.size ?? picked.size ?? 0));
    const dir = new Directory(Paths.cache, `restore-${Math.random().toString(36).slice(2, 10)}`);
    tryDelete(dir);
    dir.create({ intermediates: true });
    try {
      await Zip!.unzip(picked.uri, dir.uri);
      const stateFile = new File(dir, STATE_FILE);
      if (!stateFile.exists) throw new Error('not a backup');
      const { state } = parseBackup(await stateFile.text());
      return { state, files: {}, dir };
    } catch (e) {
      tryDelete(dir);
      throw e;
    }
  } finally {
    tryDelete(picked); // the picker's own copy in the cache
  }
}

const AUTO_DIR = 'Backups';

/**
 * Newest readable automatic backup on this device, or null (none yet, or web).
 * One that doesn't parse (a write cut short by a kill) is skipped — the two
 * older ones are the point of keeping three, and this is the only way the
 * "Use auto backup" button can reach them.
 */
export function latestAutoBackup(): File | null {
  try {
    const files = new Directory(Paths.document, AUTO_DIR)
      .list()
      .filter((f): f is File => f instanceof File && !!autoBackupDate(f.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (let i = files.length - 1; i >= 0; i--) {
      try {
        parseBackup(files[i].textSync());
        return files[i];
      } catch {
        // unreadable — try the one before
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes a backup into Documents/Backups when the newest one is `everyDays`
 * or more days old, keeping the last three. Never throws — it just retries
 * on the next launch/foreground.
 */
// ponytail: recordings aren't embedded — they live in the same documents dir
// this writes to, so bundling them would only double the disk. The auto backup
// guards the state blob; "Back up everything" is the move-phones path.
export function runAutoBackup(state: object, everyDays: number, todayKey: string) {
  try {
    const dir = new Directory(Paths.document, AUTO_DIR);
    dir.create({ intermediates: true, idempotent: true });
    const { due, prune } = autoBackupPlan(dir.list().map((f) => f.name), todayKey, everyDays);
    if (due) {
      // written beside, then moved into place: create-then-write is two steps, and a
      // kill between them left a truncated file that shadowed the intact older ones
      const tmp = new File(dir, `etude-auto-${todayKey}.json.part`);
      tmp.create({ overwrite: true });
      tmp.write(JSON.stringify({ etudeBackup: 1, state, files: {} }));
      const f = new File(dir, `etude-auto-${todayKey}.json`);
      if (f.exists) f.delete();
      tmp.move(f);
    }
    for (const name of prune) {
      try {
        new File(dir, name).delete();
      } catch {}
    }
  } catch {
    // silent by design: a failed background backup must never crash or toast
  }
}

/** Which of these documents-relative paths are gone from disk (scheme URIs are skipped). */
export function missingFiles(paths: string[]): Set<string> {
  const gone = new Set<string>();
  for (const rel of paths) {
    if (typeof rel !== 'string' || rel.includes(':')) continue; // a hand-edited entry may lack its uri
    try {
      if (!new File(Paths.document, rel).exists) gone.add(rel);
    } catch {
      // can't tell (web) — keep it rather than drop a recording that may be fine
    }
  }
  return gone;
}

/** Writes a legacy backup's embedded recordings and score pages back into the documents directory. */
export function restoreFiles(files: Record<string, string>) {
  for (const rel of restorePlan(Object.keys(files))) {
    try {
      ensureParent(Paths.document, rel);
      const f = new File(Paths.document, rel);
      f.create({ overwrite: true });
      f.write(b64ToBytes(files[rel]));
    } catch {
      // one unwritable file must not abort the whole restore
    }
  }
}

/** Every file under `dir`, as paths relative to it. */
function walk(dir: Directory, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of dir.list()) {
    const rel = prefix + entry.name;
    if (entry instanceof Directory) out.push(...walk(entry, rel + '/'));
    else out.push(rel);
  }
  return out;
}

/**
 * Copies an unzipped backup's files into the documents directory at the same
 * relative paths. Entries are untrusted: restorePlan drops the state file and
 * anything that could land outside the documents dir.
 */
export function restoreDir(dir: Directory) {
  for (const rel of restorePlan(walk(dir))) {
    try {
      ensureParent(Paths.document, rel);
      const dest = new File(Paths.document, rel);
      tryDelete(dest);
      new File(dir, rel).copy(dest);
    } catch {
      // one unwritable file must not abort the whole restore
    }
  }
}

/**
 * Clears what a backup or restore left in the cache: staging dirs a killed process
 * never removed, and archives older than a day (each is also replaced by the next
 * backup). Called once per launch; never throws.
 */
export function pruneBackupCache() {
  try {
    const entries = Paths.cache.list();
    const stale = new Set(
      staleCacheEntries(
        entries.map((e) => ({ name: e.name, dir: e instanceof Directory, mtime: e instanceof File ? e.modificationTime : null })),
        Date.now(),
      ),
    );
    for (const e of entries) if (stale.has(e.name)) tryDelete(e);
  } catch {
    // the OS reclaims the cache dir on its own; this only gets there sooner
  }
}

/** Drops a picked zip backup's staging directory, after applying it or on cancel. */
export function discardPicked(picked: PickedBackup | null | undefined) {
  tryDelete(picked?.dir);
}
