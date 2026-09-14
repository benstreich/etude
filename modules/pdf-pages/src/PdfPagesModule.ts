import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { RenderedPage } from './PdfPages.types';

declare class PdfPagesModule extends NativeModule {
  /**
   * Rasterises every page of `uri` into `outDir` as `1.png`, `2.png`, … and
   * returns them in page order. Both arguments may be file:// uris or plain
   * paths; `outDir` is created if missing and its existing pages overwritten.
   *
   * @param maxWidth longest edge in pixels; pages are scaled to fit it.
   */
  render(uri: string, outDir: string, maxWidth: number): Promise<RenderedPage[]>;
}

// Optional: Expo Go has no native side, so PDF import is a dev/release build
// feature. Callers check for null and tell the user rather than crashing.
export default requireOptionalNativeModule<PdfPagesModule>('PdfPages');
