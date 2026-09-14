// When the native "rate this app" sheet may be asked for (#68). Pure, node-runnable
// (scripts/check-review.ts). The answer is yes exactly once per install, never in
// the first week, never before the fifth saved session — and only at an earned
// moment, which the caller decides (best week yet, target tempo reached, first recap).

export const REVIEW_MIN_DAYS = 7;
export const REVIEW_MIN_SESSIONS = 5;

export function shouldPromptReview(o: { installedAt: number; promptedAt: number; sessionCount: number; now: number }): boolean {
  if (o.promptedAt > 0) return false;
  if (!(o.installedAt > 0) || o.now - o.installedAt < REVIEW_MIN_DAYS * 86400000) return false;
  return o.sessionCount >= REVIEW_MIN_SESSIONS;
}
