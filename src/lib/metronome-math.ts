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

// --- accents ----------------------------------------------------------
// One scale for everything that makes (or skips) a noise, JS and Kotlin alike:
// 0 silent · 1 plain · 2 group start · 3 bar downbeat. The subdivision click
// is not a level — it is its own sample, played between the beats.
export type Level = 0 | 1 | 2 | 3;

export const MUTED = 0;
export const PLAIN = 1;
export const MID = 2;
export const ACCENT = 3;

/**
 * What a bar sounds like when nobody has edited it: downbeat accented,
 * compound group starts lighter, everything else plain. One beat per bar has
 * nothing to accent against, so it stays plain.
 */
export function defaultAccents(sig: TimeSig): Level[] {
  if (sig.beats <= 1) return [PLAIN];
  return Array.from({ length: sig.beats }, (_, i) =>
    i === 0 ? ACCENT : isCompound(sig) && i % 3 === 0 ? MID : PLAIN
  );
}

/**
 * Fit a saved pattern to a signature: a longer one is cut, a shorter one is
 * topped up from the default, and anything out of range is clamped. Called
 * whenever the signature changes, so an edited 4/4 bar can't leak into 6/8.
 */
export function fitAccents(pattern: number[] | undefined, sig: TimeSig): Level[] {
  const fallback = defaultAccents(sig);
  if (!pattern?.length) return fallback;
  return fallback.map((d, i) => {
    const v = pattern[i];
    return (Number.isFinite(v) ? (Math.min(ACCENT, Math.max(MUTED, Math.round(v))) as Level) : d);
  });
}

/** Next level when a beat dot is tapped: accent → mid → plain → muted → accent. */
export const cycleLevel = (level: Level): Level => ((level + ACCENT) % 4) as Level;

/**
 * Level for a running beat index, from the user's pattern when there is one
 * and from `defaultAccents` otherwise.
 */
export function accentLevel(beatIndex: number, sig: TimeSig, pattern?: number[]): Level {
  const bar = fitAccents(pattern, sig);
  return bar[((beatIndex % bar.length) + bar.length) % bar.length];
}

// --- subdivisions -----------------------------------------------------

/** Clicks per beat. 1 = just the beat. */
export const SUBDIVS = [1, 2, 3, 4] as const;
export type Subdiv = (typeof SUBDIVS)[number];

export const clampSubdiv = (n: number): Subdiv =>
  (SUBDIVS as readonly number[]).includes(Math.round(n)) ? (Math.round(n) as Subdiv) : 1;

/** Where the scheduler is: which beat, and how far into it. `sub === 0` is the beat itself. */
export type TickPos = { beats: number; sub: number };

/**
 * Advance one subdivision tick. Counted rather than derived from a tick index
 * so that changing the subdivision mid-run lands on the next beat instead of
 * re-slicing the bar under the player's fingers — a subdivision dropped from 4
 * to 2 rolls over at the first tick that is now past the end of the beat.
 */
export function advanceTick(pos: TickPos, subdiv: number): TickPos {
  const n = clampSubdiv(subdiv);
  const sub = pos.sub + 1;
  return sub >= n ? { beats: pos.beats + 1, sub: 0 } : { beats: pos.beats, sub };
}

// --- handing the loop over, and taking it back ------------------------
// Android freezes JS timers when the activity pauses, so the click loop moves
// to the foreground service and back. What travels is a position, not a fresh
// start: a service that opens its own bar clicks on top of the one JS has just
// played and restarts the phrase, which is exactly what it used to do.

/** Milliseconds between ticks. Clamped, so a junk tempo can't schedule at Infinity. */
export const tickInterval = (bpm: number, subdiv: number) => 60000 / clampBpm(bpm) / clampSubdiv(subdiv);

/** What the service is told: which tick is next, and how long it still has to wait. */
export type Handoff = { beat: number; sub: number; startIn: number };

/** Hand the next tick over as the JS timer had it queued. */
export function handoffTick(run: TickPos & { nextAt: number }, now: number): Handoff {
  return {
    beat: Math.max(0, run.beats),
    sub: Math.max(0, run.sub),
    // a tick already due fires at once rather than being scheduled in the past
    startIn: Math.max(0, run.nextAt - now),
  };
}

/** Where the service got to, as it hands the loop back. */
export type TickReport = { beat: number; sub: number; nextIn: number };

/**
 * Take the loop back. `report` is null whenever nothing was ticking natively —
 * iOS, Expo Go, a run that never left the foreground — and then the run keeps
 * its own count and waits a whole interval, as it did before the service
 * existed. The beat counter is absolute: the bar accent and a bars-based ramp
 * both measure against it, so it continues rather than restarting at zero.
 */
export function resumeTick(
  run: TickPos,
  report: TickReport | null | undefined,
  interval: number
): TickPos & { wait: number } {
  if (!report) return { beats: run.beats, sub: run.sub, wait: interval };
  return {
    // integers cross the bridge as doubles
    beats: Math.max(0, Math.round(report.beat)),
    sub: Math.max(0, Math.round(report.sub)),
    wait: Math.max(0, report.nextIn),
  };
}

// --- click sounds -----------------------------------------------------

/** Sample sets, generated by scripts/make-click.py. First one is the default. */
export const SOUND_SETS = ['wood', 'click', 'beep', 'soft', 'rim'] as const;
export type SoundSet = (typeof SOUND_SETS)[number];

export const clampSound = (id: string): SoundSet =>
  (SOUND_SETS as readonly string[]).includes(id) ? (id as SoundSet) : 'wood';

/** Metronome volume, stored 0–100, used as a 0–1 gain. */
export const clampVolume = (pct: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(pct) ? pct : 100)));
export const volumeGain = (pct: number) => clampVolume(pct) / 100;

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
