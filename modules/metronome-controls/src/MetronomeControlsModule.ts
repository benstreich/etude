import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { MetronomeClick, MetronomeControlsEvents, MetronomeControlsState, MetronomeTick } from './MetronomeControls.types';

declare class MetronomeControlsModule extends NativeModule<MetronomeControlsEvents> {
  /** Put the controls up (Android: start the foreground service). */
  show(state: MetronomeControlsState): void;
  /** Repaint them — safe to call from a backgrounded app. */
  update(state: MetronomeControlsState): void;
  /** Take them down. */
  hide(): void;
  /**
   * Android: start the native beat engine — the one click source whenever the
   * metronome runs, in the app or with the screen off. It reports every tick
   * through `onTick`. No-op elsewhere, where JS times the clicks itself.
   */
  startTicking(tick: MetronomeTick): void;
  /** Android: stop the engine. No-op elsewhere. */
  stopTicking(): void;
  /** Android: retune a running engine — tempo, accents, subdivision, sound, volume. */
  updateTicking(tick: MetronomeTick): void;
  /** Android: decode every sample set ahead of the first beat. Absent on iOS. */
  preloadClicks?(): void;
  /** Android: one click for the sound picker's preview (#78). Absent on iOS. */
  click?(click: MetronomeClick): void;
}

// Optional: in Expo Go the native side isn't there. Everything else still works,
// you just don't get lock-screen controls until you run a dev build.
export default requireOptionalNativeModule<MetronomeControlsModule>('MetronomeControls');
