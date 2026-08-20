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
