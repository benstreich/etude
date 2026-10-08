// Pure halves of backup.ts, node-runnable (see scripts/check-backup.ts).

/** Paths inside a backup are untrusted: nothing may escape the documents dir. */
export const isSafeRelPath = (rel: string) =>
  rel.length > 0 && !rel.startsWith('/') && !rel.includes(':') && !rel.includes('\\') && !rel.split('/').includes('..');

/** The state file inside a zip backup; everything else in the archive is a documents-relative file. */
export const STATE_FILE = 'state.json';

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Sess = { date: string; title: string; meta: string; min: number; note?: string; rating?: number; instrument?: string };

export function buildCsv(sessions: Sess[]): string {
  const rows = ['date,focus,kind,minutes,rating,instrument,note'];
  for (const s of sessions) rows.push([s.date, csvCell(s.title), csvCell(s.meta), s.min, s.rating ?? '', csvCell(s.instrument ?? ''), csvCell(s.note ?? '')].join(','));
  return rows.join('\n');
}

const AUTO_RE = /^etude-auto-(\d{4}-\d{2}-\d{2})\.json$/;

/** The dateKey inside an auto-backup filename, or null for anything else. */
export const autoBackupDate = (name: string) => AUTO_RE.exec(name)?.[1] ?? null;

/**
 * Given the filenames already in the backups dir, decide whether a new auto
 * backup is due today (last one ≥ everyDays old) and which old files to prune
 * so at most `keep` remain after writing.
 */
export function autoBackupPlan(names: string[], todayKey: string, everyDays: number, keep = 3): { due: boolean; prune: string[] } {
  const dated = names.filter((n) => autoBackupDate(n)).sort();
  const last = dated.length ? autoBackupDate(dated[dated.length - 1])! : null;
  // dateKeys parse as UTC midnight, so the diff is an exact day count
  const due = !last || (Date.parse(todayKey) - Date.parse(last)) / 86400000 >= everyDays;
  const after = due ? [...new Set([...dated, `etude-auto-${todayKey}.json`])] : dated;
  return { due, prune: after.slice(0, Math.max(0, after.length - keep)) };
}

/**
 * Validates a backup's JSON; throws on anything that isn't an Étude backup.
 * Version 1 is the legacy single file with every attached file embedded as
 * base64 under `files`; version 2 is the state file inside a zip, where the
 * files sit beside it as real files and `files` is always empty here.
 */
export function parseBackup(raw: string): { state: object; files: Record<string, string> } {
  const data = JSON.parse(raw);
  if (!data || (data.etudeBackup !== 1 && data.etudeBackup !== 2) || typeof data.state !== 'object' || data.state === null || Array.isArray(data.state))
    throw new Error('not a backup');
  const files: Record<string, string> = {};
  if (data.etudeBackup === 1 && data.files && typeof data.files === 'object')
    for (const [k, v] of Object.entries(data.files)) if (typeof v === 'string' && isSafeRelPath(k)) files[k] = v;
  return { state: data.state, files };
}

/**
 * Which of the referenced documents-relative paths go into a backup: each once,
 * strings only, nothing with a scheme (web/blob leftovers can't be bundled) and
 * nothing that could not be restored safely either.
 */
export function backupFiles(paths: unknown[]): string[] {
  const out: string[] = [];
  for (const p of new Set(paths)) if (typeof p === 'string' && isSafeRelPath(p)) out.push(p);
  return out;
}

/**
 * Which entries of an unzipped backup are copied back under the documents dir:
 * the state file is read separately, a leading "./" is dropped, and anything
 * that could climb out of the directory (zip-slip) is skipped, not fixed.
 */
export function restorePlan(entries: string[]): string[] {
  const out: string[] = [];
  for (const raw of entries) {
    const rel = raw.startsWith('./') ? raw.slice(2) : raw;
    if (rel === STATE_FILE || !isSafeRelPath(rel) || rel.endsWith('/') || out.includes(rel)) continue;
    out.push(rel);
  }
  return out;
}

/** A picked file is a zip backup by extension or by what the picker says it is; anything else is read as legacy JSON. */
export const isBackupZip = (name: string | undefined, mimeType: string | undefined) =>
  /\.zip$/i.test(name ?? '') || /zip/i.test(mimeType ?? '');

const MB = 1024 * 1024;
// headroom left over after a backup or restore, so the phone is never filled to the last byte
const SPACE_MARGIN = 50 * MB;

/**
 * Free bytes a zip backup needs: the staged copy of every file, then the archive
 * of about the same size beside it (recordings are AAC and barely compress).
 */
export const spaceForBackup = (mediaBytes: number) => 2 * mediaBytes + SPACE_MARGIN;

/** Free bytes a zip restore needs once the picker's copy exists: the unzipped staging dir, then the copies into documents. */
export const spaceForRestore = (zipBytes: number) => 2 * zipBytes + SPACE_MARGIN;

/** Whole megabytes, rounded up, for the "needs about N MB" toast. */
export const toMb = (bytes: number) => Math.ceil(bytes / MB);

const STAGING_RE = /^(backup|restore)-/;
const ARCHIVE_RE = /^etude-backup-.*\.zip$/;

/**
 * Which cache entries a fresh launch may drop: every staging dir (a backup or
 * restore in flight never outlives its process) and archives older than a day
 * (a share target such as a mail draft may still read a recent one).
 */
export function staleCacheEntries(entries: { name: string; dir: boolean; mtime: number | null }[], now: number): string[] {
  return entries
    .filter((e) => (e.dir ? STAGING_RE.test(e.name) : ARCHIVE_RE.test(e.name) && e.mtime !== null && now - e.mtime > 86400000))
    .map((e) => e.name);
}
