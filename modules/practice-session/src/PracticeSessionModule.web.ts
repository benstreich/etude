import { NativeModule, registerWebModule } from 'expo';

import type { PracticeSessionState } from './PracticeSession.types';

// ponytail: a browser tab is not killed for memory — no-ops so callers never need a Platform check
class PracticeSessionModule extends NativeModule {
  show(_state: PracticeSessionState) {}
  hide() {}
}

export default registerWebModule(PracticeSessionModule, 'PracticeSessionModule');
