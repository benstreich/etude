// Leading/trailing silence on a take (#88). Nearly every recording opens with the
// player setting the phone down and closes with them reaching back for it, so the
// dead air is found once at save time and turned into the non-destructive
// start/end points the trim sheet already honours. Node-runnable
// (scripts/check-silence.ts) — no React, no Expo.
//
// The input is the same 0..1 level stream the waveform is built from, so this runs
// on the recorder's raw array and on the stored 60-bar `wave` alike: sample i is
// centred at (i + 0.5) / levels.length of the duration either way.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { MIN_CLIP } from './trim-math.ts';

/** Silence kept on each side, so a trim never clips the first note's attack. */
export const PAD_SEC = 0.3;
/** Below this much dead air in total, trimming isn't worth changing the file's bounds for. */
export const MIN_SAVING_SEC = 0.4;
/** Noise floor: this at minimum... */
export const FLOOR_MIN = 0.04;
/** ...or this share of the take's peak, whichever is higher. */
export const FLOOR_RATIO = 0.12;

export type SilenceTrim = { start: number; end: number } | null;

/** The level below which a sample counts as silence, for a take peaking at `peak`. */
export const noiseFloor = (peak: number) => Math.max(FLOOR_MIN, FLOOR_RATIO * peak);

/**
 * Where the music actually starts and ends, or null to leave the take alone.
 *
 * Null covers every case where trimming would be wrong or pointless: a take with
 * no sample above the floor (an accidental recording — collapsing it to nothing
 * would be worse than leaving it), one that saves less than MIN_SAVING_SEC, and
 * one whose music is shorter than MIN_CLIP once padded.
 *
 * Note the recorder clamps its levels at LEVEL_FLOOR (0.05, see motifs.tsx), so a
 * take quiet enough that 0.12 × peak falls under that reads as sound throughout
 * and returns null. That is the safe direction to fail: no trim, never a wrong one.
 */
export function detectSilence(levels: number[], durationSec: number): SilenceTrim {
  if (!levels.length || durationSec <= 0) return null;
  const floor = noiseFloor(Math.max(...levels));

  let first = -1;
  let last = -1;
  for (let i = 0; i < levels.length; i++)
    if (levels[i]! > floor) {
      if (first < 0) first = i;
      last = i;
    }
  if (first < 0) return null; // all silence

  const at = (i: number) => ((i + 0.5) / levels.length) * durationSec;
  const start = Math.max(0, at(first) - PAD_SEC);
  const end = Math.min(durationSec, at(last) + PAD_SEC);

  if (start + (durationSec - end) < MIN_SAVING_SEC) return null;
  if (end - start < MIN_CLIP) return null;
  return { start, end };
}
