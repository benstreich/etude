// Drone: a sustained reference pitch (Tools tab). Pure math here; the screen
// plays one of twelve looped samples (A3..G#4, scripts/make-drone.py) and gets
// every other octave and a shifted A4 from the playback rate with pitch
// correction off — a rate of 2 is exactly one octave up.

export const DRONE_NOTES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
export type DroneNote = (typeof DRONE_NOTES)[number];

/** The octave the shipped samples were rendered in (A3 = 220 Hz up to G#4). */
export const SAMPLE_OCTAVE = 3;
/** Octaves the picker offers. */
export const DRONE_OCTAVES = [2, 3, 4] as const;

/** A4 range the reference stepper offers, for orchestras that tune high. */
export const A4_MIN = 432;
export const A4_MAX = 446;

/** expo-audio only honours a playback rate in this window. */
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

// semitones above A within the sampled octave — A..G# is one contiguous run,
// so C4 is 3 semitones above A3, not 3 below A4
const semisAboveA = (note: DroneNote) => DRONE_NOTES.indexOf(note);

/** Frequency in Hz; `octave` is the scientific octave of the note (C4 = middle C). */
export function droneFreq(note: DroneNote, octave: number, a4 = 440): number {
  // notes from C upward belong to the next scientific octave (A3 B3 C4 ... G#4)
  const aOctave = semisAboveA(note) >= 3 ? octave - 1 : octave;
  return a4 * 2 ** ((aOctave - 4) * 12 / 12 + semisAboveA(note) / 12);
}

/** Playback rate that turns the shipped sample of `note` into `note` at `octave` with this A4. */
export function droneRate(note: DroneNote, octave: number, a4 = 440): number {
  return droneFreq(note, octave, a4) / droneFreq(note, sampleOctaveOf(note), 440);
}

/** The scientific octave in which the shipped sample of `note` sits (A3..G#4). */
export const sampleOctaveOf = (note: DroneNote) => (semisAboveA(note) >= 3 ? SAMPLE_OCTAVE + 1 : SAMPLE_OCTAVE);

/** Raw resource / file stem for a note: '#' → 's' (Android raw names are [a-z0-9_]). */
export const droneFile = (note: DroneNote) => `drone_${note.toLowerCase().replace('#', 's')}`;
