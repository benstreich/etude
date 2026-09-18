// The saved waveform: the live level samples, averaged down to a fixed number of
// bars so a 20-second take and a 20-minute one draw the same width.
export const WAVE_BARS = 60;

/** Average `raw` down to at most `bars` values, rounded to 2dp for storage. */
export function downsample(raw: number[], bars = WAVE_BARS): number[] {
  const wave =
    raw.length <= bars
      ? raw
      : Array.from({ length: bars }, (_, i) => {
          const a = Math.floor((i * raw.length) / bars);
          const b = Math.max(a + 1, Math.floor(((i + 1) * raw.length) / bars));
          return raw.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
        });
  return wave.map((v) => Math.round(v * 100) / 100);
}
