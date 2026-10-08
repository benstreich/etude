// How far along the repertoire bar a piece sits, from its stage index. Stage 0
// reads 20% rather than 1/n so a just-started piece still shows a sliver of bar.
export const stagePct = (stage: number, stages: number) =>
  stage <= 0 ? 20 : Math.round(((Math.min(stage, stages - 1) + 1) / stages) * 100);

// The stages editor keeps a slot per stage (pieces keep their index on a
// reorder, as on a rename); a slot cleared to blank removes that stage. Maps
// each old index to its new one: kept slots close up, and a removed slot's
// pieces drop back to the stage before it (or the first).
export const stageRemap = (slots: string[]): number[] => {
  let kept = 0;
  return slots.map((name) => (name.trim() ? kept++ : Math.max(0, kept - 1)));
};

// The seeded stage names are the app's words, not the user's: while they are
// still exactly one language's defaults, they follow the app language. Any
// edit (a rename, a fourth stage) makes them the user's own and they stay put.
// Returns `stages` itself when nothing changes, so callers can skip a write.
export const localizeDefaultStages = (stages: string[], defaults: string[][], target: string[]) =>
  defaults.some((d) => d.length === stages.length && d.every((n, i) => n === stages[i])) &&
  !target.every((n, i) => n === stages[i])
    ? target
    : stages;
