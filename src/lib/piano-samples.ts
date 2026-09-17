// Grand piano for the melody staff: thirteen notes of the Salamander Grand Piano
// (Alexander Holm, CC BY 3.0, via nbrosowsky/tonejs-instruments), one every three
// semitones from C3 to C6. Anything between is the nearest sample shifted by
// playback rate — at most a semitone and a half, which a piano tone wears fine.
// Static requires so Metro bundles them.

const SAMPLES: { midi: number; source: number }[] = [
  { midi: 48, source: require('../../assets/audio/piano/C3.mp3') },
  { midi: 51, source: require('../../assets/audio/piano/Ds3.mp3') },
  { midi: 54, source: require('../../assets/audio/piano/Fs3.mp3') },
  { midi: 57, source: require('../../assets/audio/piano/A3.mp3') },
  { midi: 60, source: require('../../assets/audio/piano/C4.mp3') },
  { midi: 63, source: require('../../assets/audio/piano/Ds4.mp3') },
  { midi: 66, source: require('../../assets/audio/piano/Fs4.mp3') },
  { midi: 69, source: require('../../assets/audio/piano/A4.mp3') },
  { midi: 72, source: require('../../assets/audio/piano/C5.mp3') },
  { midi: 75, source: require('../../assets/audio/piano/Ds5.mp3') },
  { midi: 78, source: require('../../assets/audio/piano/Fs5.mp3') },
  { midi: 81, source: require('../../assets/audio/piano/A5.mp3') },
  { midi: 84, source: require('../../assets/audio/piano/C6.mp3') },
];

/** The sample to play for a MIDI note, and the rate that tunes it there. */
export function pianoFor(midi: number) {
  const s = SAMPLES.reduce((best, x) => (Math.abs(x.midi - midi) < Math.abs(best.midi - midi) ? x : best), SAMPLES[0]);
  return { source: s.source, rate: 2 ** ((midi - s.midi) / 12) };
}
