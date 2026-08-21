// Pure halves of backup.ts, node-runnable (see scripts/check-improvements.ts).

/** Paths inside a backup are untrusted — nothing may escape the documents dir. */
export const isSafeRelPath = (rel: string) =>
  rel.length > 0 && !rel.startsWith('/') && !rel.includes(':') && !rel.split('/').includes('..');

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Sess = { date: string; title: string; meta: string; min: number; note?: string };

export function buildCsv(sessions: Sess[]): string {
  const rows = ['date,focus,kind,minutes,note'];
  for (const s of sessions) rows.push([s.date, csvCell(s.title), csvCell(s.meta), s.min, csvCell(s.note ?? '')].join(','));
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

/** Validates a backup blob; throws on anything that isn't an Étude backup. */
export function parseBackup(raw: string): { state: object; files: Record<string, string> } {
  const data = JSON.parse(raw);
  if (!data || data.etudeBackup !== 1 || typeof data.state !== 'object' || data.state === null || Array.isArray(data.state))
    throw new Error('not a backup');
  const files: Record<string, string> = {};
  if (data.files && typeof data.files === 'object')
    for (const [k, v] of Object.entries(data.files)) if (typeof v === 'string' && isSafeRelPath(k)) files[k] = v;
  return { state: data.state, files };
}
