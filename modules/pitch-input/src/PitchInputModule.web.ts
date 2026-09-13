import { NativeModule, registerWebModule } from 'expo';

import type { PitchInputEvents } from './PitchInput.types';

// ponytail: no mic tap on web — start() throws so the screen shows its
// unsupported card and everything else stays inert. Wire up getUserMedia plus
// an AnalyserNode here if the tuner ever needs to run in a browser.
class PitchInputModule extends NativeModule<PitchInputEvents> {
  sampleRate = 44100;
  isRecording = false;

  start() {
    throw new Error('unsupported');
  }

  stop() {}

  read(): Uint8Array {
    return new Uint8Array(0);
  }
}

export default registerWebModule(PitchInputModule, 'PitchInputModule');
