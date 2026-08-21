import { NativeModule, registerWebModule } from 'expo';

import type { WidgetData } from './EtudeWidgets.types';

// ponytail: no widgets on web — a no-op so callers never need a Platform check
class EtudeWidgetsModule extends NativeModule {
  setWidgetData(_data: WidgetData) {}
}

export default registerWebModule(EtudeWidgetsModule, 'EtudeWidgetsModule');
