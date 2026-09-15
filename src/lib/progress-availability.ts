// Why a progress section cannot show yet. The layout sheet needs this so a
// section you cannot see is a locked row with a reason, not a switch that
// silently does nothing.
//
// Each rule mirrors the floor its section enforces, and calls the same helper
// the section calls, so the two cannot drift apart. Availability is judged on
// the whole library, not the current instrument filter: the question here is
// "do you have the data at all", not "is it in this week's view".
import type { Piece, Recording, Session } from './store';

import { recordingPair } from './movement-math.ts';
import { focusDrift, MIN_INSIGHT_DAYS, MIN_RATED, rated } from './stats-math.ts';

export type Reason = 'sessions' | 'pieces' | 'rated' | 'history' | 'recordings' | 'goals' | 'ready';

/** `have` and `need` fill the counted reasons; both are 0 for the plain ones. */
export type Unavailable = { reason: Reason; have: number; need: number };

export type AvailabilityInput = {
  sessions: Session[];
  pieces: Piece[];
  recordings: Recording[];
  mbd: Record<string, number>;
  today: string;
  monday: boolean;
  /** index of the last stage, i.e. stages.length - 1 */
  lastStage: number;
  hasGoals: boolean;
};

const plain = (reason: Reason): Unavailable => ({ reason, have: 0, need: 0 });

/** Days with practice on or before today — the floor the insight cards use. */
const practisedDays = (mbd: Record<string, number>, today: string) =>
  Object.keys(mbd).filter((k) => mbd[k] > 0 && k <= today).length;

/**
 * `null` means the section can render. Anything else is the reason it cannot,
 * ready to be turned into a sentence by the caller.
 */
export function sectionUnavailable(key: string, i: AvailabilityInput): Unavailable | null {
  const noSessions = i.sessions.length === 0;
  const noPieces = i.pieces.length === 0;

  switch (key) {
    // Always renderable: the calendar draws an empty month, the totals draw zeros.
    case 'heatmap':
    case 'volume':
      return null;

    case 'movement':
    case 'pipeline':
      return noPieces ? plain('pieces') : null;

    case 'timeByFocus':
    case 'consistency':
    case 'last7':
      return noSessions ? plain('sessions') : null;

    case 'changed':
      return noSessions && noPieces ? plain('sessions') : null;

    case 'goals':
      return i.hasGoals ? null : plain('goals');

    case 'hear': {
      const withPair = i.pieces.filter((p) => recordingPair(i.recordings.filter((r) => r.piece === p.id)) !== null).length;
      return withPair === 0 ? plain('recordings') : null;
    }

    case 'performable':
      return i.pieces.some((p) => p.stage >= i.lastStage) ? null : plain('ready');

    case 'rating': {
      const have = rated(i.sessions).length;
      return have === 0 ? { reason: 'rated', have, need: 1 } : null;
    }

    case 'timeOfDay':
    case 'sessionLength': {
      const have = rated(i.sessions).length;
      return have < MIN_RATED ? { reason: 'rated', have, need: MIN_RATED } : null;
    }

    case 'insights': {
      const have = practisedDays(i.mbd, i.today);
      return have < MIN_INSIGHT_DAYS ? { reason: 'history', have, need: MIN_INSIGHT_DAYS } : null;
    }

    case 'drift':
      return focusDrift(i.sessions, i.today, i.monday) ? null : plain('history');

    default:
      return null;
  }
}
