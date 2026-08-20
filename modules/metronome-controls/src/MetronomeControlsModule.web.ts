import { NativeModule, registerWebModule } from 'expo';

import type { MetronomeControlsEvents, MetronomeControlsState, MetronomeTick } from './MetronomeControls.types';

// ponytail: no lock screen on web — no-ops so callers never need a Platform check.
class MetronomeControlsModule extends NativeModule<MetronomeControlsEvents> {
  show(_state: MetronomeControlsState) {}
  update(_state: MetronomeControlsState) {}
  hide() {}
  startTicking(_tick: MetronomeTick) {}
  stopTicking() {}
}

export default registerWebModule(MetronomeControlsModule, 'MetronomeControlsModule');
