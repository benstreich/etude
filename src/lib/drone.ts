// Drone: a sustained reference pitch (Tools tab). Pure math here; the screen
// plays one of twelve looped samples (all of scientific octave 4,
// scripts/make-drone.py) and gets every other octave and a shifted A4 from the
// playback rate with pitch correction off — a rate of 2 is exactly one octave up.
//
// The samples are rendered in the TOP octave the picker offers, so every rate
// is a pitch down (0.245..1.014) and none of them approaches expo-audio's
// ceiling of 2.0. Rendering A..B an octave lower used to push A4/A#4/B4 above
// concert pitch past that ceiling.

export const DRONE_NOTES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
export type DroneNote = (typeof DRONE_NOTES)[number];

/** The scientific octave every shipped sample is rendered in (C4 .. B4, A4 = 440). */
export const SAMPLE_OCTAVE = 4;
/** Octaves the picker offers. */
export const DRONE_OCTAVES = [2, 3, 4] as const;

/** A4 range the reference stepper offers, for orchestras that tune high. */
export const A4_MIN = 432;
export const A4_MAX = 446;

/**
 * Playback rates expo-audio honours: 0.1..2 on Android, 0.0..2 on iOS
 * (SDK 57 docs). The Android floor is the binding one.
 */
export const MIN_RATE = 0.1;
export const MAX_RATE = 2;

// semitones above A within the A..G# listing order; notes from C upward belong
// to the next scientific octave, which is what aOctave below corrects for
const semisAboveA = (note: DroneNote) => DRONE_NOTES.indexOf(note);

/** Frequency in Hz; `octave` is the scientific octave of the note (C4 = middle C). */
export function droneFreq(note: DroneNote, octave: number, a4 = 440): number {
  // notes from C upward belong to the next scientific octave (A3 B3 C4 ... G#4)
  const aOctave = semisAboveA(note) >= 3 ? octave - 1 : octave;
  return a4 * 2 ** ((aOctave - 4) * 12 / 12 + semisAboveA(note) / 12);
}

/** Playback rate that turns the shipped sample of `note` into `note` at `octave` with this A4. */
export function droneRate(note: DroneNote, octave: number, a4 = 440): number {
  return droneFreq(note, octave, a4) / droneFreq(note, SAMPLE_OCTAVE, 440);
}

/** Raw resource / file stem for a note: '#' → 's' (Android raw names are [a-z0-9_]). */
export const droneFile = (note: DroneNote) => `drone_${note.toLowerCase().replace('#', 's')}`;
