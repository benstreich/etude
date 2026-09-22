import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { PracticeSessionState } from './PracticeSession.types';

declare class PracticeSessionModule extends NativeModule {
  /**
   * Android: put up (or repaint) the ongoing "practising" notification, which is a
   * foreground service — the process stays alive with the screen off, and the
   * notification's clock ticks natively, so nothing depends on a JS timer that
   * Android has frozen. No-op elsewhere.
   */
  show(state: PracticeSessionState): void;
  /** Take it down. */
  hide(): void;
}

// Optional: in Expo Go the native side isn't there, and the session still runs
// on its wall-clock timer — it just has no notification keeping the process up.
export default requireOptionalNativeModule<PracticeSessionModule>('PracticeSession');
