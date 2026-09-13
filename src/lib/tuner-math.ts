// Tuner math: equal-temperament note conversion, instrument string targets, and
// YIN pitch detection. Pure — no React, no native imports — so the whole
// algorithm runs under scripts/check-tuner.ts on a desktop with synthesized
// waveforms. The native side (modules/pitch-input) does no DSP at all; it only
// hands over raw frames, which keeps this the single copy of the logic.

/** Sharps only. One spelling per pitch class; there is no key context to guess from. */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_REF_A = 440;
export const MIN_REF_A = 415;
export const MAX_REF_A = 445;

export type Note = {
  /** e.g. 'A' or 'A#'. The view layer renders '#' as '♯'. */
  name: string;
  /** Scientific pitch notation: middle C is C4. */
  octave: number;
  midi: number;
  /** Signed distance to the nearest semitone, -50..50. */
  cents: number;
};

export const midiToHz = (midi: number, refA = DEFAULT_REF_A) => refA * 2 ** ((midi - 69) / 12);

export function toNote(hz: number, refA = DEFAULT_REF_A): Note {
  const exact = 69 + 12 * Math.log2(hz / refA);
  const midi = Math.round(exact);
  return {
    name: NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    midi,
    // exact - midi is within ±0.5 by construction; the clamp guards float edges
    cents: Math.max(-50, Math.min(50, (exact - midi) * 100)),
  };
}

export type Instrument = {
  id: string;
  /** Open-string MIDI numbers. Empty means free chromatic. */
  strings: number[];
};

// ponytail: a flat table, not a presets engine. A new instrument is one line.
export const INSTRUMENTS: Instrument[] = [
  { id: 'chromatic', strings: [] },
  { id: 'guitar', strings: [40, 45, 50, 55, 59, 64] }, // E2 A2 D3 G3 B3 E4
  { id: 'bass', strings: [28, 33, 38, 43] }, // E1 A1 D2 G2
  { id: 'violin', strings: [55, 62, 69, 76] }, // G3 D4 A4 E5
  { id: 'viola', strings: [48, 55, 62, 69] }, // C3 G3 D4 A4
  { id: 'cello', strings: [36, 43, 50, 57] }, // C2 G2 D3 A3
  { id: 'ukulele', strings: [67, 60, 64, 69] }, // G4 C4 E4 A4 — reentrant, G is high
];

/**
 * Index of the closest open string, or null past 3 semitones so a stray note
 * doesn't yank the highlight across the instrument.
 */
export function nearestString(midi: number, strings: number[]): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [i, s] of strings.entries()) {
    const d = Math.abs(s - midi);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return bestDist <= 4 ? best : null;
}

/** Frames per analysis window — ~93 ms at 44.1 kHz. Two periods of the lowest
 *  supported note (bass low E, 41.2 Hz) must fit. Must stay in sync with WINDOW
 *  in PitchInputModule.kt and PitchInputModule.swift. */
export const WINDOW = 4096;
/** Below bass low E (41.2 Hz). */
export const MIN_HZ = 38;
/** Above violin E5 (659 Hz), with headroom. */
export const MAX_HZ = 1000;

/**
 * Naive YIN is O(window × lags): ~2.3M multiply-accumulates per analysis at
 * 44.1 kHz, 25×/sec — too slow for Hermes. Averaging groups of 4 samples (a box
 * filter, which also anti-aliases) drops that to ~290K for the same 93 ms of
 * audio. It costs lag resolution up high, which the parabolic step recovers;
 * check-tuner.ts guards that with sub-2-cent assertions at 659 and 880 Hz.
 * ponytail: if those ever fail on real input, set this to 2 and re-run.
 */
const DECIMATION = 4;
/** YIN's absolute threshold — below it, a dip counts as a real period. */
const THRESHOLD = 0.15;
/** RMS floor. Quieter than this is a room, not a note. */
const MIN_RMS = 0.005;
/** Clarity floor. Noise produces shallow dips; real notes produce deep ones. */
const MIN_CLARITY = 0.5;

export type Pitch = { hz: number; clarity: number };

export function detectPitch(samples: Float32Array, sampleRate: number): Pitch | null {
  // Cheap gate first — no point running YIN on a silent room.
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / samples.length) < MIN_RMS) return null;

  const rate = sampleRate / DECIMATION;
  const n = Math.floor(samples.length / DECIMATION);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < DECIMATION; k++) acc += samples[i * DECIMATION + k];
    x[i] = acc / DECIMATION;
  }

  const minLag = Math.max(2, Math.floor(rate / MAX_HZ));
  const maxLag = Math.min(n - 1, Math.ceil(rate / MIN_HZ));
  const span = n - maxLag;
  if (maxLag <= minLag || span < 64) return null;

  // YIN steps 1-2: difference function, then cumulative mean normalization.
  // Both are kept: cmnd picks the lag, diff refines it (see step 4).
  const diff = new Float32Array(maxLag + 1);
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < span; i++) {
      const delta = x[i] - x[i + lag];
      d += delta * delta;
    }
    diff[lag] = d;
    running += d;
    cmnd[lag] = running === 0 ? 1 : (d * lag) / running;
  }

  // YIN step 3: the FIRST lag under the threshold, walked down into its local
  // minimum. "First, not smallest" is precisely what stops a rich timbre from
  // locking onto a harmonic an octave up.
  let lag = -1;
  for (let i = minLag; i <= maxLag; i++) {
    if (cmnd[i] < THRESHOLD) {
      while (i + 1 <= maxLag && cmnd[i + 1] < cmnd[i]) i++;
      lag = i;
      break;
    }
  }
  if (lag < 0) return null;

  // YIN step 4: parabolic interpolation around the dip, for sub-sample
  // precision. This is what buys back the resolution decimation gave away.
  //
  // Interpolate on the RAW difference function, not on cmnd. cmnd divides by a
  // running mean that grows with lag, which tilts the parabola and drags the
  // vertex — worth about -5 cents at 41 Hz, where the dip is widest. diff has
  // no such tilt. cmnd still chooses which dip; it just doesn't measure it.
  const a = lag > 0 ? diff[lag - 1] : diff[lag];
  const b = diff[lag];
  const c = lag < maxLag ? diff[lag + 1] : diff[lag];
  const denom = 2 * (2 * b - a - c);
  const refined = denom === 0 ? lag : lag + (c - a) / denom;

  const hz = rate / refined;
  const clarity = 1 - cmnd[lag];
  if (hz < MIN_HZ || hz > MAX_HZ || clarity < MIN_CLARITY) return null;
  return { hz, clarity };
}

/**
 * Median of the readings on hand. Median, not mean: a single octave error is
 * discarded outright instead of being averaged into the answer.
 */
export function smooth(history: number[]): number {
  if (history.length === 0) return 0;
  const sorted = [...history].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Little-endian Int16 PCM → normalized floats. Lives here rather than beside the
 * native bridge so check-tuner.ts can assert the byte layout without pulling in
 * expo-audio: those bytes are a contract between Kotlin, Swift and JS.
 */
export function bytesToSamples(bytes: Uint8Array): Float32Array {
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}
