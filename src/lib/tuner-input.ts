// Bridge between the native mic tap and the pure pitch math: permissions,
// lifecycle, and unpacking the bytes. Everything here is I/O; the maths lives
// in tuner-math.ts so it stays testable without a device.
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

import { bytesToSamples } from './tuner-math';
import PitchInput from '../../modules/pitch-input';

export type TunerStatus = 'ok' | 'no-module' | 'denied' | 'error';

/** `isCancelled` is asked once the permission prompt resolves: the screen may
 *  have been left while it was up, and the mic must not open for it then. */
export async function startInput(isCancelled: () => boolean = () => false): Promise<TunerStatus> {
  // Expo Go has no native side — the screen offers a dev build instead.
  if (!PitchInput) return 'no-module';
  try {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return 'denied';
    if (isCancelled()) return 'error'; // discarded by the caller either way
    PitchInput.start();
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Checks without prompting — for noticing a grant made in system Settings. */
export async function micGranted(): Promise<boolean> {
  try {
    return (await getRecordingPermissionsAsync()).granted;
  } catch {
    return false;
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
