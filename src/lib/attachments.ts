// Score attachments (#60): picking files, copying them into the documents
// directory and throwing them away again. The naming rules are in
// attachment-math.ts; this file is the only place that touches the disk.
//
// ponytail: PDFs are rasterised to PNG pages once, at import, by the local
// modules/pdf-pages module. The viewer then has a single code path — images —
// and never has to open a document at all.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import PdfPages from '../../modules/pdf-pages';
import { dirFor, displayName, extOf, kindFor, pageFile, type Attachment } from './attachment-math';
import { toStoredUri } from './store';

/** Longest edge of a rendered PDF page. Retina-sharp on a phone, still small. */
const PAGE_MAX_PX = 2048;

const uid = () => Math.random().toString(36).slice(2, 10);

export class UnsupportedFileError extends Error {}
export class NoPdfRendererError extends Error {}

/**
 * Picks one or more files and copies them under `attachments/<id>/`. Returns
 * the attachments to store, or an empty array when the user cancels.
 *
 * Throws UnsupportedFileError for anything that isn't a PDF or an image, and
 * NoPdfRendererError for a PDF in Expo Go, where there's no native renderer.
 */
export async function pickAttachments(piece: string): Promise<Attachment[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];

  const out: Attachment[] = [];
  for (const asset of res.assets) {
    const kind = kindFor(asset.name, asset.mimeType);
    if (!kind) throw new UnsupportedFileError(asset.name);
    if (kind === 'pdf' && !PdfPages) throw new NoPdfRendererError(asset.name);

    const id = uid();
    const dir = new Directory(Paths.document, dirFor(id));
    dir.create({ intermediates: true, idempotent: true });

    let files: string[];
    if (kind === 'pdf') {
      const pages = await PdfPages!.render(asset.uri, dir.uri, PAGE_MAX_PX);
      if (pages.length === 0) {
        dir.delete();
        throw new UnsupportedFileError(asset.name);
      }
      // the module writes straight into the directory, already 1.png, 2.png, …
      files = pages.map((p) => toStoredUri(p.uri));
    } else {
      const ext = extOf(asset.name) || 'jpg';
      const dest = new File(Paths.document, pageFile(id, 0, ext));
      await new File(asset.uri).copy(dest);
      files = [toStoredUri(dest.uri)];
    }

    out.push({ id, piece, name: displayName(asset.name), kind, files, addedAt: Date.now() });
  }
  return out;
}

/** Removes an attachment's whole folder; missing files are not an error. */
export function deleteAttachmentFiles(ids: string[]) {
  for (const id of ids) {
    try {
      const dir = new Directory(Paths.document, dirFor(id));
      if (dir.exists) dir.delete();
    } catch {
      // a file the user already cleared out by hand shouldn't block the delete
    }
  }
}
