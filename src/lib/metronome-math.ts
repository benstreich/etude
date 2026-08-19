// Pure metronome arithmetic. No React, no expo — so `npm run check:metronome` can run it in node.

export type RampUnit = 'bars' | 'seconds';

export type Ramp = {
  on: boolean;
  /** BPM added (or removed) per step. Always positive — direction comes from `target`. */
  step: number;
  /** How many `unit`s between steps. */
  every: number;
  unit: RampUnit;
  /** Where the ramp stops. Below the starting tempo means it ramps down. */
  target: number;
};

export type Elapsed = { bars: number; seconds: number };

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

// --- time signatures --------------------------------------------------

export type TimeSig = { beats: number; denom: number };

/** '6/8' → {beats: 6, denom: 8}. Anything unparseable falls back to 4/4. */
export function parseSig(sig: string): TimeSig {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(sig);
  const beats = m ? Number(m[1]) : 4;
  const denom = m ? Number(m[2]) : 4;
  return beats >= 1 && beats <= 16 && [2, 4, 8, 16].includes(denom) ? { beats, denom } : { beats: 4, denom: 4 };
}

/** Compound meters (6/8, 9/8, 12/8) pulse in groups of three. */
export const isCompound = (sig: TimeSig) => sig.denom === 8 && sig.beats > 3 && sig.beats % 3 === 0;

/**
 * Accent for a running beat index: 2 = bar downbeat, 1 = compound group start
 * (the "four" in ONE-two-three-FOUR-five-six), 0 = plain. One beat per bar
 * means every click is plain — nothing to accent against.
 */
export function accentLevel(beatIndex: number, sig: TimeSig): 0 | 1 | 2 {
  if (sig.beats <= 1) return 0;
  const pos = beatIndex % sig.beats;
  if (pos === 0) return 2;
  if (isCompound(sig) && pos % 3 === 0) return 1;
  return 0;
}

/**
 * The tempo a run that started at `startBpm` should be at after `elapsed`.
 *
 * Derived from the elapsed counters rather than accumulated per beat, so a
 * dropped or catch-up tick can never drift the ramp off course.
 */
export function bpmAfter(startBpm: number, ramp: Ramp, elapsed: Elapsed): number {
  const start = clampBpm(startBpm);
  if (!ramp.on || ramp.step <= 0 || ramp.every <= 0) return start;
  const direction = Math.sign(ramp.target - start);
  if (direction === 0) return start;

  // anything that isn't seconds counts bars, so a unit saved by an older
  // version ('beats', 'minutes') degrades to bars instead of producing NaN
  const units = ramp.unit === 'seconds' ? elapsed.seconds : elapsed.bars;

  const moved = Math.floor(units / ramp.every) * ramp.step * direction;
  const bpm = start + moved;
  return clampBpm(direction > 0 ? Math.min(bpm, ramp.target) : Math.max(bpm, ramp.target));
}

/** One-line description of the ramp for the UI, or null when it does nothing. */
export function describeRamp(startBpm: number, ramp: Ramp): string | null {
  if (!ramp.on || ramp.step <= 0 || ramp.every <= 0 || ramp.target === clampBpm(startBpm)) return null;
  const up = ramp.target > startBpm;
  const unit = ramp.every === 1 ? ramp.unit.replace(/s$/, '') : ramp.unit;
  return `${up ? '+' : '−'}${ramp.step} BPM every ${ramp.every} ${unit} → ${ramp.target}`;
}

/** Average BPM of the taps, or null until there are at least two usable ones. */
export function tapTempo(taps: number[]): number | null {
  const recent = taps.slice(-5);
  const gaps = recent.slice(1).map((t, i) => t - recent[i]).filter((g) => g >= 200 && g <= 3000);
  if (gaps.length === 0) return null;
  return clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
}
