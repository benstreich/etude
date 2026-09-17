// The twelve looped drone samples (A3..G#4, scripts/make-drone.py), keyed by note.
// Static requires so Metro bundles them; shared by the Drone screen and the
// melody playback on Home.
import type { DroneNote } from './drone';

export const DRONE_SAMPLES: Record<DroneNote, number> = {
  A: require('../../assets/audio/drone_a.wav'),
  'A#': require('../../assets/audio/drone_as.wav'),
  B: require('../../assets/audio/drone_b.wav'),
  C: require('../../assets/audio/drone_c.wav'),
  'C#': require('../../assets/audio/drone_cs.wav'),
  D: require('../../assets/audio/drone_d.wav'),
  'D#': require('../../assets/audio/drone_ds.wav'),
  E: require('../../assets/audio/drone_e.wav'),
  F: require('../../assets/audio/drone_f.wav'),
  'F#': require('../../assets/audio/drone_fs.wav'),
  G: require('../../assets/audio/drone_g.wav'),
  'G#': require('../../assets/audio/drone_gs.wav'),
};
