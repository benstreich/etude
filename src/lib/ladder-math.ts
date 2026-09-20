// The clean-pass tempo ladder (#90): repeat a passage until it is clean N times
// in a row, then bump the metronome. The player judges "clean" — this module only
// does the bookkeeping that otherwise interrupts practice.
//
// Deliberately a reducer over one event type rather than a set of handlers: a
// future third source of passes (onset detection, a pedal) becomes another event,
// not another copy of the counting rules.
//
// Node-runnable (scripts/check-ladder.ts): no React, no Expo.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { MAX_BPM } from './metronome-math.ts';

/** Off until asked for; three clean passes, then +4 BPM. */
export const LADDER_DEFAULTS = { on: false, need: 3, step: 4 };

export type LadderConfig = { on: boolean; need: number; step: number };
export type LadderState = { tally: number; bpm: number };
export type LadderEvent = 'pass' | 'miss' | 'manual-bpm';
export type LadderResult = {
  tally: number;
  bpm: number;
  /** The BPM moved — the caller fires the haptic, the toast and logTempo. */
  advanced: boolean;
  /** That advance hit the ceiling: the target tempo, or MAX_BPM. */
  reachedTarget: boolean;
};

/**
 * A piece's ladder config, with the defaults filled in. Never writes them back:
 * a piece that has not been configured should stay unconfigured in the blob.
 */
export const resolveLadder = (l?: Partial<LadderConfig>): LadderConfig => ({ ...LADDER_DEFAULTS, ...l });

/**
 * One tap, or one BPM change the player made themselves.
 *
 * A miss resets the tally, and so does a manual BPM change — moving the tempo by
 * hand means a different exercise, and counting the reps before it towards it
 * would be counting the wrong thing.
 *
 * At the ceiling the tally still fills (the control stays live and readable) but
 * nothing advances: the ladder is finished, and silently resetting the dots would
 * read as the taps not registering.
 */
export function ladderStep(s: LadderState, e: LadderEvent, cfg: { need: number; step: number; target: number }): LadderResult {
  const flat = { tally: s.tally, bpm: s.bpm, advanced: false, reachedTarget: false };
  if (e !== 'pass') return { ...flat, tally: 0 };

  const cap = Math.min(cfg.target > 0 ? cfg.target : MAX_BPM, MAX_BPM);
  const tally = s.tally + 1;
  if (tally < cfg.need) return { ...flat, tally };
  if (s.bpm >= cap) return { ...flat, tally: Math.min(tally, cfg.need) };

  const bpm = Math.min(s.bpm + cfg.step, cap);
  return { tally: 0, bpm, advanced: true, reachedTarget: bpm >= cap };
}
