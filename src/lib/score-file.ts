// The imported score on disk (#92): picking a MusicXML file, and reading,
// writing and deleting the parsed JSON under documents/scores/<pieceId>.json.
// The parsing itself is lib/musicxml.ts; this file is the only place that
// touches the picker or the file system for it.
//
// Why a file and not the store: the whole state re-serializes on every change,
// and a multi-page score is tens of kilobytes — it would tax every keystroke.
// The store keeps only the documents-relative pointer (absolute paths rot on iOS).
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { resolveRecordingUri, toStoredUri } from './doc-path';
import { isCompressedMusicXml, type ScorePiece } from './musicxml';

const DIR = 'scores';

/** A .mxl — zipped MusicXML — which v1 does not unpack; the caller explains and asks for the uncompressed export. */
export class CompressedMusicXmlError extends Error {}

/** Documents-relative path of a piece's score JSON — keyed by piece id, so a rename never moves it. */
export const scoreFileFor = (pieceId: string) => `${DIR}/${pieceId}.json`;

/**
 * Picks one file and reads it as text. Returns null when the user cancels.
 * The picker is not filtered by MIME type on purpose: Android has no registered
 * type for .musicxml and greys the files out under a filter — the parser is the
 * real gate, and an unreadable file is a toast, not a hidden file.
 */
export async function pickMusicXml(): Promise<{ xml: string; name: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
  if (res.canceled || !res.assets.length) return null;
  const asset = res.assets[0];
  const xml = await new File(asset.uri).text();
  if (isCompressedMusicXml(asset.name, xml.slice(0, 4))) throw new CompressedMusicXmlError(asset.name);
  return { xml, name: asset.name };
}

/** Writes the parsed score for a piece, replacing any earlier one. Returns the stored (documents-relative) path. */
export function writeScore(pieceId: string, score: ScorePiece): string {
  const dir = new Directory(Paths.document, DIR);
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${pieceId}.json`);
  file.write(JSON.stringify(score));
  return toStoredUri(file.uri);
}

/** The parsed score behind a stored path; null when the file is gone or unreadable. */
export async function readScore(stored: string): Promise<ScorePiece | null> {
  try {
    const file = new File(resolveRecordingUri(stored));
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text()) as ScorePiece;
    return Array.isArray(parsed?.parts) ? parsed : null;
  } catch {
    return null;
  }
}

/** Removes a piece's score file; a file already gone is not an error. */
export function deleteScoreFile(pieceId: string) {
  try {
    const file = new File(Paths.document, scoreFileFor(pieceId));
    if (file.exists) file.delete();
  } catch {
    // the user may have cleared the folder by hand — nothing to block on
  }
}
