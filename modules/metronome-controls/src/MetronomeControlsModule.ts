import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  MetronomeClick,
  MetronomeControlsEvents,
  MetronomeControlsState,
  MetronomeTick,
} from './MetronomeControls.types';

declare class MetronomeControlsModule extends NativeModule<MetronomeControlsEvents> {
  /** Put the controls up (Android: start the foreground service). */
  show(state: MetronomeControlsState): void;
  /** Repaint them — safe to call from a backgrounded app. */
  update(state: MetronomeControlsState): void;
  /** Take them down. */
  hide(): void;
  /** Android: the service clicks while JS timers are frozen (app backgrounded). No-op elsewhere. */
  startTicking(tick: MetronomeTick): void;
  /** Android: hand the click loop back to JS. No-op elsewhere. */
  stopTicking(): void;
  /** Android: retune a loop that is already running — tempo, accents, subdivision, sound, volume. */
  updateTicking(tick: MetronomeTick): void;
  /** Android: decode every sample set into the SoundPool. Absent on iOS. */
  preloadClicks?(): void;
  /** Android: fire one click from the same SoundPool the background loop uses (#78). Absent on iOS. */
  click?(click: MetronomeClick): void;
}

// Optional: in Expo Go the native side isn't there. Everything else still works,
// you just don't get lock-screen controls until you run a dev build.
export default requireOptionalNativeModule<MetronomeControlsModule>('MetronomeControls');
