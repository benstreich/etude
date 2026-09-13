// Bridge between the native mic tap and the pure pitch math: permissions,
// lifecycle, and unpacking the bytes. Everything here is I/O; the maths lives
// in tuner-math.ts so it stays testable without a device.
import { requestRecordingPermissionsAsync } from 'expo-audio';

import { bytesToSamples } from './tuner-math';
import PitchInput from '../../modules/pitch-input';

export type TunerStatus = 'ok' | 'no-module' | 'denied' | 'error';

export async function startInput(): Promise<TunerStatus> {
  // Expo Go has no native side — the screen offers a dev build instead.
  if (!PitchInput) return 'no-module';
  try {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return 'denied';
    PitchInput.start();
    return 'ok';
  } catch {
    return 'error';
  }
}

export function stopInput() {
  try {
    PitchInput?.stop();
  } catch {
    // stopping a mic that is already gone isn't worth surfacing
  }
}

/** null until the ring has filled once, or when there's no native module. */
export function readSamples(): Float32Array | null {
  const bytes = PitchInput?.read();
  if (!bytes || bytes.byteLength === 0) return null;
  return bytesToSamples(bytes);
}

export const inputSampleRate = () => PitchInput?.sampleRate ?? 44100;
