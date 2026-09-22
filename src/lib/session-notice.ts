// The running-session notification: on Android a foreground service, which is
// what keeps the process — and the wall-clock timer that the session is — alive
// while the screen is off. Keeping the session running is the app's one job;
// this is the native half of it (modules/practice-session). Elsewhere a no-op.
import PracticeSession from '../../modules/practice-session';

export type SessionNotice = {
  title: string;
  subtitle?: string;
  running: boolean;
  /** milliseconds practised so far, at the moment of the call */
  elapsedMs: number;
};

/** Put up or repaint the notification. Call on every transition (start, pause, resume, focus change), not per tick. */
export const showSessionNotice = (n: SessionNotice) => {
  PracticeSession?.show(n);
};

export const hideSessionNotice = () => {
  PracticeSession?.hide();
};
