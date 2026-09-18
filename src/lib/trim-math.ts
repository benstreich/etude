// Non-destructive trim handles on the recording waveform. The audio is AAC/m4a
// and nothing on device can re-encode it, so these bounds only steer playback.
export const MIN_CLIP = 0.5; // seconds — the handles never cross or meet
export const NUDGE = 0.1; // seconds per nudge tap, for bounds the finger can't hit

export type Clip = { start?: number; end?: number; sec: number };
export type Handle = 'start' | 'end';

export const inPoint = (c: Clip) => c.start ?? 0;
export const outPoint = (c: Clip) => c.end ?? c.sec;
export const isTrimmed = (c: Clip) => c.start !== undefined || c.end !== undefined;

/** Seconds at pixel `x` across a waveform `width` wide. */
export const timeAt = (c: Clip, x: number, width: number) =>
  Math.min(c.sec, Math.max(0, (x / Math.max(1, width)) * c.sec));

/** Which handle a touch at `x` is reaching for. */
export function nearestHandle(c: Clip, x: number, width: number): Handle {
  const at = timeAt(c, x, width);
  return Math.abs(at - inPoint(c)) <= Math.abs(at - outPoint(c)) ? 'start' : 'end';
}

/**
 * Put one handle at `t` seconds. The other stays put, both stay inside the file,
 * and they keep MIN_CLIP between them — every other mover goes through here so
 * none of them can invent a crossed or out-of-bounds clip.
 */
export function setHandle(c: Clip, handle: Handle, t: number): { start: number; end: number } {
  const s = inPoint(c);
  const e = outPoint(c);
  return handle === 'start'
    ? { start: Math.max(0, Math.min(t, e - MIN_CLIP)), end: e }
    : { start: s, end: Math.min(c.sec, Math.max(t, s + MIN_CLIP)) };
}

/** Drag a named handle to the finger. */
export const dragHandle = (c: Clip, handle: Handle, x: number, width: number) =>
  setHandle(c, handle, timeAt(c, x, width));

/** Drag anywhere on the waveform: whichever handle is nearer follows the finger. */
export const dragTrim = (c: Clip, x: number, width: number) =>
  dragHandle(c, nearestHandle(c, x, width), x, width);

/** Tap-sized adjustment, for the last tenth of a second a fingertip can't resolve. */
export const nudgeTrim = (c: Clip, handle: Handle, steps: number) =>
  setHandle(c, handle, (handle === 'start' ? inPoint(c) : outPoint(c)) + steps * NUDGE);

/** Set a bound to where playback has actually reached — trim by ear, not by eye. */
export const setFromPlayhead = (c: Clip, handle: Handle, t: number) => setHandle(c, handle, t);

export const clearTrim = () => ({ start: undefined, end: undefined });
