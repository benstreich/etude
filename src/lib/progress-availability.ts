// Why a progress section cannot show yet. The layout sheet needs this so a
// section you cannot see is a locked row with a reason, not a switch that
// silently does nothing.
//
// Each rule mirrors the floor its section enforces, and calls the same helper
// the section calls, so the two cannot drift apart. Availability is judged on
// the whole library, not the current instrument filter: the question here is
// "do you have the data at all", not "is it in this week's view".
import type { Piece, Recording, Session } from './store';

import { CHALLENGE_FLOOR_DAYS } from './challenge-math.ts';
import { recordingPair } from './movement-math.ts';
import { focusDrift, MIN_INSIGHT_DAYS, MIN_RATED, rated } from './stats-math.ts';

export type Reason = 'sessions' | 'pieces' | 'rated' | 'history' | 'recordings' | 'goals' | 'ready' | 'challenge';

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

/**
 * The availability input, built from the store once. Both the layout sheet and
 * the Settings row need it, and building it twice by hand is how the two came
 * to disagree about what "on" means.
 */
export function availabilityFrom(s: {
  sessions: Session[];
  pieces: Piece[];
  recordings: Recording[];
  minutesByDate: Record<string, number>;
  today: string;
  weekStart: string;
  stages: unknown[];
  dailyGoal: number;
}): AvailabilityInput {
  // Judged on the whole library rather than the current filter: the question is
  // whether the data exists at all, not whether this week happens to show it.
  const live = s.pieces.filter((p) => !p.archived);
  return {
    sessions: s.sessions,
    pieces: live,
    recordings: s.recordings,
    mbd: s.minutesByDate,
    today: s.today,
    monday: s.weekStart === 'Monday',
    lastStage: s.stages.length - 1,
    hasGoals: s.dailyGoal > 0 || s.pieces.some((p) => !!p.targetDate),
  };
}

/**
 * How many sections are switched on *and* able to render — which is what the
 * layout sheet's switches actually show. A section whose data floor is not met
 * draws as off and cannot be toggled, so counting its stored `on` reports more
 * sections than the screen has switches for.
 */
export function countOnSections(layout: { key: string; on: boolean }[], i: AvailabilityInput): number {
  return layout.filter((l) => l.on && !sectionUnavailable(l.key, i)).length;
}

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
    // Always renderable: the calendar draws an empty month, charts and totals draw zeros.
    case 'calendar':
    case 'lineChart':
    case 'barChart':
    case 'volume':
      return null;

    case 'movement':
    case 'pipeline':
      return noPieces ? plain('pieces') : null;

    case 'timeByFocus':
    case 'consistency':
      return noSessions ? plain('sessions') : null;

    case 'changed':
      return noSessions && noPieces ? plain('sessions') : null;

    case 'goals':
      return i.hasGoals ? null : plain('goals');

    case 'hear': {
      const withPair = i.pieces.filter((p) => recordingPair(i.recordings.filter((r) => r.piece === p.name)) !== null).length;
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

    // #105: the same floor monthlyChallenge applies — practised days before this month
    case 'challenge': {
      const monthStart = i.today.slice(0, 7) + '-01';
      const have = Object.keys(i.mbd).filter((k) => i.mbd[k] > 0 && k < monthStart).length;
      return have < CHALLENGE_FLOOR_DAYS ? { reason: 'challenge', have, need: CHALLENGE_FLOOR_DAYS } : null;
    }

    default:
      return null;
  }
}
