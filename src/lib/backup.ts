// Backup / restore / CSV export for the "Your data" settings section.
// ponytail: the backup is one JSON file with recordings and score pages
// embedded as base64 —
// no zip lib exists that works in Expo Go. Switch to a real archive if
// hour-long recording libraries make the JSON too big to stringify.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { autoBackupDate, autoBackupPlan, buildCsv, isSafeRelPath, parseBackup } from './backup-math';
import type { Session } from './store';
import { dateKey } from './streak-math';

// Everything is held in memory as base64 and then copied again by stringify; past
// this the app can run out of memory and die without a toast. Thrown as
// BACKUP_TOO_LARGE so the caller can say so instead.
const MAX_FILE_BYTES = 150 * 1024 * 1024;
export const BACKUP_TOO_LARGE = 'backup-too-large';

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

// a second tap while one export is still encoding would start a second one and a second share sheet
let exporting = false;
/**
 * One file: full state JSON + every attached file (recordings and score pages),
 * each as documents-relative path → base64.
 */
export async function exportBackup(state: object, paths: string[]) {
  if (exporting) return;
  exporting = true;
  try {
    await writeBackup(state, paths);
  } finally {
    exporting = false;
  }
}

async function writeBackup(state: object, paths: string[]) {
  const found: [string, File][] = [];
  let bytes = 0;
  for (const rel of new Set(paths)) {
    if (typeof rel !== 'string' || rel.includes(':')) continue; // web/blob leftovers can't be bundled
    const f = new File(Paths.document, rel);
    if (!f.exists) continue;
    found.push([rel, f]);
    bytes += f.size ?? 0;
  }
  // checked before reading anything, so a too-big library costs no memory at all
  if (bytes > MAX_FILE_BYTES) throw new Error(BACKUP_TOO_LARGE);
  const files: Record<string, string> = {};
  for (const [rel, f] of found) files[rel] = await f.base64();
  const date = dateKey();
  await shareFile(`etude-backup-${date}.json`, JSON.stringify({ etudeBackup: 1, state, files }), 'application/json');
}

export async function exportCsv(sessions: Session[]) {
  // the BOM is what makes Excel read the file as UTF-8 — without it umlauts garble
  await shareFile(`etude-sessions-${dateKey()}.csv`, '\uFEFF' + buildCsv(sessions), 'text/csv');
}

/**
 * Picks a backup file and returns its parsed payload, or null when the user
 * cancels. Throws on a file that isn't an Étude backup — caller toasts.
 * Applying it (writing files + replacing state) is a separate, confirmed step.
 */
export async function pickBackup(): Promise<{ state: object; files: Record<string, string> } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (res.canceled) return null;
  // base64 grows files by a third; a file past what exportBackup would write is not read at all
  if ((res.assets[0].size ?? 0) > MAX_FILE_BYTES * 1.4) throw new Error(BACKUP_TOO_LARGE);
  return parseBackup(await new File(res.assets[0].uri).text());
}

const AUTO_DIR = 'Backups';

/** Newest automatic backup on this device, or null (none yet, or web). */
export function latestAutoBackup(): File | null {
  try {
    const files = new Directory(Paths.document, AUTO_DIR)
      .list()
      .filter((f): f is File => f instanceof File && !!autoBackupDate(f.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    return files[files.length - 1] ?? null;
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
      const f = new File(dir, `etude-auto-${todayKey}.json`);
      f.create({ overwrite: true });
      f.write(JSON.stringify({ etudeBackup: 1, state, files: {} }));
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

/** Writes the bundled recordings and score pages back into the documents directory. */
export function restoreFiles(files: Record<string, string>) {
  for (const [rel, b64] of Object.entries(files)) {
    // paths come from an untrusted file — nothing may escape the documents dir
    // (parseBackup filters too; kept here so this stays safe on its own)
    if (!isSafeRelPath(rel)) continue;
    try {
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      if (dir) new Directory(Paths.document, dir).create({ intermediates: true, idempotent: true });
      const f = new File(Paths.document, rel);
      f.create({ overwrite: true });
      f.write(b64ToBytes(b64));
    } catch {
      // one unwritable file must not abort the whole restore
    }
  }
}
