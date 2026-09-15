// Pure helpers behind the piece-first progress definitions (spec 2026-09-15).
// Node-runnable, no React, no Date.now — "today" is always passed in.
import type { StageEntry } from './store';

/** Append a stage change: ascending, one entry per day (last write wins), no-op when the stage did not change. */
export function appendStageLog(log: StageEntry[] | undefined, date: string, stage: number): StageEntry[] {
  const cur = log ?? [];
  const last = cur[cur.length - 1];
  if (last && last.date === date) return [...cur.slice(0, -1), { date, stage }];
  if (last && last.stage === stage) return cur;
  return [...cur, { date, stage }];
}
