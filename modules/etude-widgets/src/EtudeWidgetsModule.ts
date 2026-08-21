import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { WidgetData } from './EtudeWidgets.types';

declare class EtudeWidgetsModule extends NativeModule {
  /** Persist the snapshot and repaint every placed widget. */
  setWidgetData(data: WidgetData): void;
}

// Optional: in Expo Go the native side isn't there. The app works fine,
// widgets just need a dev/release build.
export default requireOptionalNativeModule<EtudeWidgetsModule>('EtudeWidgets');
