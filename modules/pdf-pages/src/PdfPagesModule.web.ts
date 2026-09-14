import { NativeModule, registerWebModule } from 'expo';

import type { RenderedPage } from './PdfPages.types';

// ponytail: no PDF rasteriser on web — an empty result reads as "nothing to
// show" all the way up, so no caller needs a Platform check.
class PdfPagesModule extends NativeModule {
  async render(_uri: string, _outDir: string, _maxWidth: number): Promise<RenderedPage[]> {
    return [];
  }
}

export default registerWebModule(PdfPagesModule, 'PdfPagesModule');
