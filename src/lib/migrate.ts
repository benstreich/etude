// Pure saved-state upgrade logic, node-runnable (see scripts/check-migrate.ts).
// Merges a saved blob over the current seed so old installs pick up new
// defaults, and upgrades legacy shapes in place. Anything unreadable falls
// back to the seed — a corrupt blob must never brick the app at launch.
import { dateKey } from './streak-math.ts';

type StageEntry = { date: string; stage: number };
/** One-time backfill for pieces that predate the stage log: one entry at addedAt (or today) with the current stage. */
export function backfillStageLog(p: { stage: number; stageLog?: StageEntry[]; addedAt?: number }, todayKey: string): StageEntry[] {
  if (p.stageLog && p.stageLog.length) return p.stageLog;
  const date = p.addedAt ? dateKey(new Date(p.addedAt)) : todayKey;
  return [{ date, stage: p.stage }];
}

export function migrate<S>(raw: string | null, seedState: S): S {
  if (!raw) return seedState;
  let saved: any;
  try {
    saved = JSON.parse(raw);
  } catch {
    return seedState;
  }
  if (!saved || typeof saved !== 'object') return seedState;
  // merge over seed so states saved before new settings existed pick up defaults
  const merged: any = { ...seedState, ...saved };
  // legacy: pieces stored a named status before stages became a list
  const legacyStage: Record<string, number> = { Learning: 0, Polishing: 1, Ready: 2 };
  // only when no stages list exists yet: a blob saved since carries both, and
  // re-converting would undo every later rename or added stage on each launch
  if (saved.stageLabels && !Array.isArray(saved.stages))
    merged.stages = ['Learning', 'Polishing', 'Ready'].map((k) => saved.stageLabels[k] || k);
  delete merged.stageLabels;
  // hand-edited or half-written blobs can hold nulls in their lists; one would throw below
  const isObj = (x: unknown) => !!x && typeof x === 'object';
  for (const k of ['pieces', 'recordings', 'sessions', 'attachments', 'plans'])
    if (Array.isArray(merged[k])) merged[k] = merged[k].filter(isObj);
  // a stage index past the list (left by the stageLabels bug above) has no column to show in
  const lastStage = Array.isArray(merged.stages) && merged.stages.length ? merged.stages.length - 1 : Infinity;
  if (saved.metroBeatsPerBar && !saved.metroTimeSig) merged.metroTimeSig = `${saved.metroBeatsPerBar}/4`;
  merged.pieces = (Array.isArray(merged.pieces) ? merged.pieces : []).map(
    (p: { stage?: number; status?: string }) => ({
      ...p,
      stage: Math.min(p.stage ?? legacyStage[p.status ?? ''] ?? 0, lastStage),
    }),
  );
  // spec 2026-09-15: every piece carries a stage log; older pieces get one entry at addedAt
  {
    const todayKey = dateKey();
    merged.pieces = merged.pieces.map((p: { stage: number; stageLog?: { date: string; stage: number }[]; addedAt?: number }) => ({ ...p, stageLog: backfillStageLog(p, todayKey) }));
  }
  // #83: techniques used to be bare names next to the pieces; they are pieces of
  // kind 'Technique' now. A name that already exists as a piece is not doubled.
  if (Array.isArray(saved.techniques)) {
    const have = new Set(merged.pieces.map((p: { name?: string }) => String(p.name ?? '').trim().toLowerCase()));
    // the slug folds 'C major' and 'C-major' (and any all-umlaut name) together — suffix repeats
    const ids = new Set(merged.pieces.map((p: { id?: string }) => p.id));
    for (const raw of saved.techniques) {
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name || have.has(name.toLowerCase())) continue;
      have.add(name.toLowerCase());
      const base = 'tech-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item');
      let id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
      merged.pieces.push({ id, name, by: '', stage: 0, pct: 10, kind: 'Technique' });
    }
  }
  delete merged.techniques;
  // plans arrived with #17 — older blobs (and hand-edited ones) may lack the array
  if (!Array.isArray(merged.plans)) merged.plans = [];
  // score attachments arrived with #60 — same guard, same reason
  if (!Array.isArray(merged.attachments)) merged.attachments = [];
  // library folders arrived with #102; an older blob gets none, which renders flat
  if (!Array.isArray(merged.folders)) merged.folders = [];
  if (!Array.isArray(merged.collapsedFolders)) merged.collapsedFolders = [];
  // onboarding arrived after launch — anyone with a saved blob has used the app
  if (saved.onboarded === undefined) merged.onboarded = true;
  // all seven days as break days would make the streak unbreakable (and meaningless)
  if (Array.isArray(merged.breakDays) && merged.breakDays.length >= 7) merged.breakDays = [];
  // legacy: recordings stored absolute file:// URIs, which rot on iOS when the app
  // container UUID changes on update — rewrite to a documents-relative path
  merged.recordings = (Array.isArray(merged.recordings) ? merged.recordings : []).map(
    (r: { uri?: string }) => ({
      ...r,
      uri: typeof r.uri === 'string' ? r.uri.replace(/^.*?\/(Documents|files)\//, '') : r.uri,
    }),
  );
  // #58: with exactly one instrument every untagged piece and session belongs to it
  if (Array.isArray(merged.instruments) && merged.instruments.length === 1) {
    const inst = merged.instruments[0];
    merged.pieces = merged.pieces.map((p: { instrument?: string }) => ({ ...p, instrument: p.instrument ?? inst }));
    if (Array.isArray(merged.sessions))
      merged.sessions = merged.sessions.map((x: { instrument?: string }) => ({ ...x, instrument: x.instrument ?? inst }));
  }
  return merged as S;
}
