/** What the running-session notification shows. */
export type PracticeSessionState = {
  /** First line — the piece or routine being practised. */
  title: string;
  /** Second line, already localized by the caller ("Session", "Paused"). */
  subtitle?: string;
  /** Running: the notification's own clock ticks on from `elapsedMs`. Paused: it shows `elapsedMs` frozen. */
  running: boolean;
  /** Milliseconds practised so far at the moment of this call. */
  elapsedMs: number;
};
