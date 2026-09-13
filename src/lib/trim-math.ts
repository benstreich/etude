// Non-destructive trim handles on the recording waveform. The audio is AAC/m4a
// and nothing on device can re-encode it, so these bounds only steer playback.
const MIN_CLIP = 0.5; // seconds — the handles never cross or meet

// Drag anywhere on the waveform: whichever handle is nearer follows the finger.
export function dragTrim(
  { start = 0, end, sec }: { start?: number; end?: number; sec: number },
  x: number,
  width: number
): { start: number; end: number } {
  const out = end ?? sec;
  const at = Math.min(sec, Math.max(0, (x / Math.max(1, width)) * sec));
  return Math.abs(at - start) <= Math.abs(at - out)
    ? { start: Math.max(0, Math.min(at, out - MIN_CLIP)), end: out }
    : { start, end: Math.min(sec, Math.max(at, start + MIN_CLIP)) };
}
