// The running-session notification: on Android a foreground service, which is
// what keeps the process — and the wall-clock timer that the session is — alive
// while the screen is off. Keeping the session running is the app's one job;
// this is the native half of it (modules/practice-session). Elsewhere a no-op.
import PracticeSession from '../../modules/practice-session';
import { tr } from './i18n';
import { ensureNotificationPermission } from './reminders';

export type SessionNotice = {
  title: string;
  subtitle?: string;
  running: boolean;
  /** milliseconds practised so far, at the moment of the call */
  elapsedMs: number;
};

const post = (n: SessionNotice) => PracticeSession?.show({ ...n, channel: tr('practice.sessionChannel') });

// the notice on screen and when it was posted, for the repaint after a grant
let shown: { n: SessionNotice; at: number } | null = null;
let asked = false;

/** Put up or repaint the notification. Call on every transition (start, pause, resume, focus change), not per tick. */
export const showSessionNotice = (n: SessionNotice) => {
  shown = { n, at: Date.now() };
  post(n);
  if (asked) return;
  asked = true;
  // The first session is where the break alert and this notification need the
  // permission, and nothing else in the flow asks. Android 13+ silently drops a
  // notification posted before the grant — repaint once it lands.
  ensureNotificationPermission().then((granted) => {
    if (!granted || !shown) return;
    const { n: last, at } = shown;
    post(last.running ? { ...last, elapsedMs: last.elapsedMs + Date.now() - at } : last);
  });
};

export const hideSessionNotice = () => {
  shown = null;
  PracticeSession?.hide();
};
