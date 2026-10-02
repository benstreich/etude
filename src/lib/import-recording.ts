// Importing takes recorded elsewhere: pick audio files, copy them into the
// documents directory next to the app's own recordings, and read their length.
import { createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { toStoredUri } from './doc-path';

const DIR = 'imported'; // documents-relative; the recorder writes to the documents root
const uid = () => Math.random().toString(36).slice(2, 10);

export type ImportedTake = { uri: string; name: string; sec: number };

/** Seconds of audio in a file (tenths), read by loading it once; 0 when the player never reports a length. */
async function durationOf(uri: string): Promise<number> {
  const p = createAudioPlayer({ uri });
  try {
    for (let waited = 0; !p.isLoaded && waited < 4000; waited += 50) await new Promise((r) => setTimeout(r, 50));
    // tenths, not whole seconds: a rounded-down length cut the last half second off playback
    return p.isLoaded && Number.isFinite(p.duration) ? Math.round(p.duration * 10) / 10 : 0;
  } finally {
    p.remove();
  }
}

/**
 * Picks one or more audio files and copies them in. Returns the takes to store
 * (empty when the user cancels) and the first error, if any file failed. A file
 * whose length can't be read still imports — it just shows no duration until
 * it's played.
 *
 * Each file stands alone: one failed copy used to throw away the takes already
 * copied, leaving their files on disk with nothing in the store pointing at them.
 */
export async function pickRecordings(): Promise<{ added: ImportedTake[]; error?: unknown }> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { added: [] };
  const dir = new Directory(Paths.document, DIR);
  dir.create({ intermediates: true, idempotent: true });
  const added: ImportedTake[] = [];
  let error: unknown;
  for (const asset of res.assets) {
    const ext = asset.name.includes('.') ? asset.name.split('.').pop()!.toLowerCase() : 'm4a';
    const dest = new File(dir, `${uid()}.${ext}`);
    try {
      await new File(asset.uri).copy(dest);
      added.push({ uri: toStoredUri(dest.uri), name: asset.name.replace(/\.[^.]+$/, ''), sec: await durationOf(dest.uri) });
    } catch (e) {
      error ??= e;
      try {
        if (dest.exists) dest.delete();
      } catch {}
    }
  }
  return { added, error };
}
