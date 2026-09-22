// Optional folders in the repertoire (#102). Two flat pieces of state do the
// work — `settings.folders` is the ordered, user-editable list (exactly like
// `stages`) and `piece.folder` names one of them — so grouping is a render-time
// fold over the already-filtered list, never a second copy of the library.
//
// Node-runnable (scripts/check-folder.ts): no React, no Expo.
import type { Piece } from './store';

/** Enough to organise a large library; past this the list stops being a shortcut. */
export const MAX_FOLDERS = 12;
/** Longer than a stage name (20) — a folder is a longer-lived label. */
export const MAX_FOLDER_NAME = 24;

/** `folder: null` is the ungrouped section, and always sorts last. */
export type FolderSection = { folder: string | null; pieces: Piece[] };

/**
 * The list, folded into sections in `folders` order, ungrouped last.
 *
 * Empty folders are kept: a folder just created, or emptied by the instrument
 * filter, has to stay on screen or it reads as having been lost. A piece naming
 * a folder that no longer exists falls to ungrouped rather than vanishing —
 * removeFolderIn clears those, but a hand-edited or restored blob may not have.
 *
 * With no folders at all this returns one ungrouped section, which is what makes
 * "zero folders renders exactly as today" fall out rather than being special-cased.
 */
export function groupByFolder(pieces: Piece[], folders: string[]): FolderSection[] {
  if (!folders.length) return [{ folder: null, pieces }];
  const known = new Set(folders);
  const sections: FolderSection[] = folders.map((folder) => ({ folder, pieces: [] }));
  const byName = new Map(sections.map((sec) => [sec.folder as string, sec]));
  const ungrouped: FolderSection = { folder: null, pieces: [] };
  for (const p of pieces) {
    const sec = p.folder && known.has(p.folder) ? byName.get(p.folder)! : ungrouped;
    sec.pieces.push(p);
  }
  return [...sections, ungrouped];
}

/**
 * The name to store, or null if it can't be one: blank, over the length cap,
 * already taken (case-insensitively — two folders differing only in case are a
 * mistake, not a distinction), or one folder too many.
 *
 * For a rename, pass `existing` without the name being renamed, so keeping the
 * same letters and changing only the case is allowed and the cap doesn't fire.
 */
export function validFolderName(name: string, existing: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_FOLDER_NAME) return null;
  if (existing.length >= MAX_FOLDERS) return null;
  const lower = trimmed.toLowerCase();
  if (existing.some((f) => f.toLowerCase() === lower)) return null;
  return trimmed;
}

/** Rename a folder and carry every piece filed under it across. */
export function renameFolderIn(folders: string[], pieces: Piece[], from: string, to: string) {
  return {
    folders: folders.map((f) => (f === from ? to : f)),
    pieces: pieces.map((p) => (p.folder === from ? { ...p, folder: to } : p)),
  };
}

/** Drop a folder. The pieces stay — only the grouping goes. */
export function removeFolderIn(folders: string[], pieces: Piece[], name: string) {
  return {
    folders: folders.filter((f) => f !== name),
    pieces: pieces.map((p) => (p.folder === name ? { ...p, folder: undefined } : p)),
  };
}
