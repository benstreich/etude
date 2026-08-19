import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { MetronomeControlsEvents, MetronomeControlsState } from './MetronomeControls.types';

declare class MetronomeControlsModule extends NativeModule<MetronomeControlsEvents> {
  /** Put the controls up (Android: start the foreground service). */
  show(state: MetronomeControlsState): void;
  /** Repaint them — safe to call from a backgrounded app. */
  update(state: MetronomeControlsState): void;
  /** Take them down. */
  hide(): void;
}

// Optional: in Expo Go the native side isn't there. Everything else still works,
// you just don't get lock-screen controls until you run a dev build.
export default requireOptionalNativeModule<MetronomeControlsModule>('MetronomeControls');
