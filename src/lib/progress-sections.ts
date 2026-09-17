// The registry of progress definitions (spec 2026-09-15). Order here is the
// default order; defaultOn is what a user who never opens the layout sheet sees.
export type SectionKey =
  | 'movement' | 'goals' | 'calendar' | 'lineChart' | 'barChart' | 'volume'
  | 'hear' | 'pipeline' | 'performable' | 'changed'
  | 'insights' | 'timeByFocus' | 'drift' | 'consistency' | 'rating' | 'timeOfDay' | 'sessionLength';

export type LayoutItem = { key: string; on: boolean };

// calendar/line/bars used to be one "heatmap" section with an internal view
// switch; each is its own toggle now, so a saved layout can show more than one at once
export const PROGRESS_SECTIONS: { key: SectionKey; defaultOn: boolean }[] = [
  { key: 'movement', defaultOn: true },
  { key: 'goals', defaultOn: true },
  { key: 'calendar', defaultOn: true },
  { key: 'lineChart', defaultOn: false },
  { key: 'barChart', defaultOn: false },
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
];

/** Saved order first (unknown keys dropped), then every registry key the saved list lacks, with its default. */
export function resolveLayout(saved: LayoutItem[], registry = PROGRESS_SECTIONS): { key: SectionKey; on: boolean }[] {
  const known = new Map(registry.map((s) => [s.key, s.defaultOn]));
  const kept = saved.filter((x) => known.has(x.key as SectionKey)).map((x) => ({ key: x.key as SectionKey, on: x.on }));
  const seen = new Set(kept.map((x) => x.key));
  return [...kept, ...registry.filter((s) => !seen.has(s.key)).map((s) => ({ key: s.key, on: s.defaultOn }))];
}
