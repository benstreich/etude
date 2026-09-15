// The registry of progress definitions (spec 2026-09-15). Order here is the
// default order; defaultOn is what a user who never opens the layout sheet sees.
export type SectionKey =
  | 'movement' | 'goals' | 'heatmap' | 'volume'
  | 'hear' | 'pipeline' | 'performable' | 'changed'
  | 'insights' | 'timeByFocus' | 'drift' | 'consistency' | 'rating' | 'timeOfDay' | 'sessionLength' | 'last7';

export type LayoutItem = { key: string; on: boolean };

export const PROGRESS_SECTIONS: { key: SectionKey; defaultOn: boolean }[] = [
  { key: 'movement', defaultOn: true },
  { key: 'goals', defaultOn: true },
  { key: 'heatmap', defaultOn: true },
  { key: 'volume', defaultOn: true },
  { key: 'hear', defaultOn: false },
  { key: 'pipeline', defaultOn: false },
  { key: 'performable', defaultOn: false },
  { key: 'changed', defaultOn: false },
  { key: 'insights', defaultOn: false },
  { key: 'timeByFocus', defaultOn: false },
  { key: 'drift', defaultOn: false },
  { key: 'consistency', defaultOn: false },
  { key: 'rating', defaultOn: false },
  { key: 'timeOfDay', defaultOn: false },
  { key: 'sessionLength', defaultOn: false },
  { key: 'last7', defaultOn: false },
];

/** Saved order first (unknown keys dropped), then every registry key the saved list lacks, with its default. */
export function resolveLayout(saved: LayoutItem[], registry = PROGRESS_SECTIONS): { key: SectionKey; on: boolean }[] {
  const known = new Map(registry.map((s) => [s.key, s.defaultOn]));
  const kept = saved.filter((x) => known.has(x.key as SectionKey)).map((x) => ({ key: x.key as SectionKey, on: x.on }));
  const seen = new Set(kept.map((x) => x.key));
  return [...kept, ...registry.filter((s) => !seen.has(s.key)).map((s) => ({ key: s.key, on: s.defaultOn }))];
}
