// How far along the repertoire bar a piece sits, from its stage index. Stage 0
// reads 20% rather than 1/n so a just-started piece still shows a sliver of bar.
export const stagePct = (stage: number, stages: number) =>
  stage <= 0 ? 20 : Math.round(((Math.min(stage, stages - 1) + 1) / stages) * 100);
