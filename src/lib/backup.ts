// Backup / restore / CSV export for the "Your data" settings section.
// ponytail: the backup is one JSON file with recordings embedded as base64 —
// no zip lib exists that works in Expo Go. Switch to a real archive if
// hour-long recording libraries make the JSON too big to stringify.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(sessions: Session[]) {
  const rows = ['date,focus,kind,minutes,note'];
  for (const s of sessions) rows.push([s.date, csvCell(s.title), csvCell(s.meta), s.min, csvCell(s.note ?? '')].join(','));
  const date = new Date().toISOString().slice(0, 10);
  await shareFile(`etude-sessions-${date}.csv`, rows.join('\n'), 'text/csv');
}

/**
 * Picks a backup file and returns its parsed payload, or null when the user
 * cancels. Throws on a file that isn't an Étude backup — caller toasts.
 * Applying it (writing files + replacing state) is a separate, confirmed step.
 */
export async function pickBackup(): Promise<{ state: object; files: Record<string, string> } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (res.canceled) return null;
  const raw = await new File(res.assets[0].uri).text();
  const data = JSON.parse(raw);
  if (!data || data.etudeBackup !== 1 || typeof data.state !== 'object') throw new Error('not a backup');
  return { state: data.state, files: data.files ?? {} };
}

/** Writes the bundled recordings back into the documents directory. */
export function restoreFiles(files: Record<string, string>) {
  for (const [rel, b64] of Object.entries(files)) {
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
