// Backup / restore / CSV export for the "Your data" settings section.
// ponytail: the backup is one JSON file with recordings embedded as base64 —
// no zip lib exists that works in Expo Go. Switch to a real archive if
// hour-long recording libraries make the JSON too big to stringify.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { autoBackupDate, autoBackupPlan, buildCsv, isSafeRelPath, parseBackup } from './backup-math';
import type { Recording, Session } from './store';

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

/** One file: full state JSON + every recording (documents-relative uri → base64). */
export async function exportBackup(state: object, recordings: Recording[]) {
  const files: Record<string, string> = {};
  for (const r of recordings) {
    if (r.uri.includes(':')) continue; // web/blob leftovers can't be bundled
    const f = new File(Paths.document, r.uri);
    if (f.exists) files[r.uri] = await f.base64();
  }
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(`etude-backup-${date}.json`, JSON.stringify({ etudeBackup: 1, state, files }), 'application/json');
}

export async function exportCsv(sessions: Session[]) {
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(`etude-sessions-${date}.csv`, buildCsv(sessions), 'text/csv');
}

/**
 * Picks a backup file and returns its parsed payload, or null when the user
 * cancels. Throws on a file that isn't an Étude backup — caller toasts.
 * Applying it (writing files + replacing state) is a separate, confirmed step.
 */
export async function pickBackup(): Promise<{ state: object; files: Record<string, string> } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (res.canceled) return null;
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

/** Writes the bundled recordings back into the documents directory. */
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
      // one unwritable recording must not abort the whole restore
    }
  }
}
