// Pure saved-state upgrade logic, node-runnable (see scripts/check-migrate.ts).
// Merges a saved blob over the current seed so old installs pick up new
// defaults, and upgrades legacy shapes in place. Anything unreadable falls
// back to the seed — a corrupt blob must never brick the app at launch.

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
  if (saved.stageLabels)
    merged.stages = ['Learning', 'Polishing', 'Ready'].map((k) => saved.stageLabels[k] || k);
  if (saved.metroBeatsPerBar && !saved.metroTimeSig) merged.metroTimeSig = `${saved.metroBeatsPerBar}/4`;
  merged.pieces = (Array.isArray(merged.pieces) ? merged.pieces : []).map(
    (p: { stage?: number; status?: string }) => ({
      ...p,
      stage: p.stage ?? legacyStage[p.status ?? ''] ?? 0,
    }),
  );
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
  return merged as S;
}
