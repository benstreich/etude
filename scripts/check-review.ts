// Review prompt gate (#68): once per install, after a week and five sessions.
import assert from 'node:assert';

import { REVIEW_MIN_DAYS, REVIEW_MIN_SESSIONS, shouldPromptReview } from '../src/lib/review-math.ts';

const DAY = 86400000;
const installedAt = Date.parse('2026-09-01T10:00:00Z');
const base = { installedAt, promptedAt: 0, sessionCount: REVIEW_MIN_SESSIONS, now: installedAt + REVIEW_MIN_DAYS * DAY };

assert.equal(shouldPromptReview(base), true);
assert.equal(shouldPromptReview({ ...base, now: installedAt + REVIEW_MIN_DAYS * DAY - 1 }), false, 'too early');
assert.equal(shouldPromptReview({ ...base, sessionCount: REVIEW_MIN_SESSIONS - 1 }), false, 'too few sessions');
assert.equal(shouldPromptReview({ ...base, promptedAt: installedAt + DAY }), false, 'already asked');
assert.equal(shouldPromptReview({ ...base, installedAt: 0 }), false, 'unknown install date never asks');
assert.equal(shouldPromptReview({ ...base, sessionCount: 200, now: installedAt + 400 * DAY }), true, 'late is fine');

console.log('review gate ok');
