import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { PitchInputEvents } from './PitchInput.types';

declare class PitchInputModule extends NativeModule<PitchInputEvents> {
  /** Open the mic and start filling the ring buffer. Idempotent. */
  start(): void;
  /** Release the mic. Idempotent. */
  stop(): void;
  /**
   * The most recent 4096 frames as little-endian Int16 PCM, mono (8192 bytes),
   * oldest first. Empty until the ring has filled once.
   *
   * Uint8Array because it is the only typed array Expo Modules documents as a
   * convertible (Data on iOS, ByteArray on Android) — Float32Array is not.
   */
  read(): Uint8Array;
  /** Actual capture rate; the device may not honour the 44100 request. */
  readonly sampleRate: number;
  readonly isRecording: boolean;
}

// Optional: in Expo Go the native side isn't there. The tuner screen shows a
// "needs a dev build" card instead of crashing.
export default requireOptionalNativeModule<PitchInputModule>('PitchInput');
