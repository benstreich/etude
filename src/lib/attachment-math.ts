// Score attachments (#60): the naming and grouping rules, kept pure and
// node-runnable — see scripts/check-attachment.ts. Everything that touches the
// filesystem lives in attachments.ts.

export type AttachmentKind = 'pdf' | 'image';

export type Attachment = {
  id: string;
  /** piece name, the same join recordings and sessions use */
  piece: string;
  name: string;
  kind: AttachmentKind;
  /** documents-relative page files, in order; an image has exactly one */
  files: string[];
  addedAt: number;
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'];

export const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/**
 * What kind of attachment a picked file is, or null when we can't show it.
 * The mime type leads; the extension is the fallback, because Android content
 * providers happily hand back `application/octet-stream`.
 */
export function kindFor(name: string, mimeType?: string | null): AttachmentKind | null {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  const ext = extOf(name);
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

/** Display name for a picked file: drop the extension, keep the rest. */
export function displayName(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return base.trim() || fileName;
}

/**
 * Where an attachment's files live, relative to the documents directory.
 * ponytail: keyed by the attachment id, not the piece — ids are already
 * filesystem-safe, so no name sanitising and no rename bookkeeping. Deleting
 * one attachment is deleting one folder.
 */
export const ATTACH_DIR = 'attachments';
export const dirFor = (id: string) => `${ATTACH_DIR}/${id}`;
export const pageFile = (id: string, i: number, ext: string) => `${dirFor(id)}/${i + 1}.${ext}`;

/** Attachments of one piece, newest first. */
export const forPiece = (all: Attachment[], piece: string) =>
  all.filter((a) => a.piece === piece).sort((a, b) => b.addedAt - a.addedAt);

/** Every stored file of the given attachments — what a delete has to remove. */
export const filesOf = (list: Attachment[]) => list.flatMap((a) => a.files);
