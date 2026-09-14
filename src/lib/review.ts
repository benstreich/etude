// The one place the automatic review prompt is fired from (#68). Settings' manual
// "Leave a review" row calls StoreReview directly and does not count as the once.
import * as StoreReview from 'expo-store-review';

import { shouldPromptReview } from './review-math';

type ReviewStore = {
  installedAt: number;
  reviewPromptedAt: number;
  sessions: unknown[];
  updateSettings: (patch: { reviewPromptedAt: number }) => void;
};

/** Ask once, if this install has earned it. Marks the attempt before asking so a slow sheet can never double up. */
export async function maybeRequestReview(store: ReviewStore) {
  if (!shouldPromptReview({ installedAt: store.installedAt, promptedAt: store.reviewPromptedAt, sessionCount: store.sessions.length, now: Date.now() })) return;
  try {
    if (!(await StoreReview.hasAction())) return;
    store.updateSettings({ reviewPromptedAt: Date.now() });
    await StoreReview.requestReview();
  } catch {
    // the OS decides whether the sheet shows at all; nothing to do when it declines
  }
}
