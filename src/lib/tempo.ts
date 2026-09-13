// Musical-motif math: the tempo-term bands, and the barline positions for the
// plan runner's measure bar.

// Italian tempo term for a BPM — the musical motif that prefixes every tempo in
// the UI ("Andante · 84 BPM"). Bands are the design handoff's, not a standard:
// real-world tempo markings overlap and disagree, so these are chosen to cover
// the range continuously with no gaps.
export const TEMPO_BANDS: [max: number, term: string][] = [
  [76, 'Adagio'],
  [90, 'Andante'],
  [108, 'Moderato'],
  [120, 'Allegretto'],
];

/** <76 Adagio · 76–89 Andante · 90–107 Moderato · 108–119 Allegretto · ≥120 Allegro */
export function tempoTerm(bpm: number): string {
  for (const [max, term] of TEMPO_BANDS) if (bpm < max) return term;
  return 'Allegro';
}

/**
 * Fractions (0–1) along the measure bar where a barline is drawn: the start,
 * then each segment boundary. The final boundary is left out — that end is the
 * double barline, drawn at the bar's right edge.
 */
export function barlines(segments: number[]): number[] {
  const total = segments.reduce((a, b) => a + b, 0);
  if (total <= 0) return [0];
  return segments.slice(0, -1).reduce((xs, m) => [...xs, xs[xs.length - 1] + m / total], [0]);
}
