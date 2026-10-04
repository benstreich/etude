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
