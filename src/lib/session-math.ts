// Pure session-edit math for the store, node-runnable. Editing a session's
// minutes must move totalMin and that day's minutesByDate by the same delta —
// these three are the source of every stat, streak, and heatmap cell.

/** A practice session in flight, persisted so a process death cannot lose it. */
export type LiveSession = {
  name: string;
  kind: 'Piece' | 'Technique';
  /** wall clock when last (re)started; null while paused */
  startedAt: number | null;
  /** seconds banked up to the last pause or resume */
  accum: number;
  /** wall clock when the session began — the header's "started 9:55" */
  startClock: number;
  /** the instrument answered at start, when it had to be asked */
  inst: string | null;
  breaksSeen: number;
  /** the trouble spot chosen for this session (#91), so a restart keeps the choice; absent = whole piece */
  spot?: string | null;
  /** heartbeat: the last moment the app was alive with this session running */
  lastSeen: number;
};

/**
 * A restart inside this window keeps the clock running through the gap. It has
 * to cover a whole practice stretch, not just a crash: Android freezes JS timers
 * the moment the screen goes off, so the heartbeat below stops well before the
 * process is killed, and a 23-minute session with the phone in a pocket used to
 * come back paused at the last heartbeat — 00:49. A process that survives counts
 * that gap in full (the timer is wall-clock), and a killed one must agree.
 */
export const LIVE_GRACE_MS = 4 * 3600000;

/**
 * What a restored session's clock should read. A death inside LIVE_GRACE_MS (a
 * crash, an OS restart, Android reclaiming the app mid-practice) keeps running
 * through the gap; a longer one banks time only up to the last heartbeat and
 * comes back paused — an app killed overnight must not claim the night was practised.
 */
export function restoreLive(ls: Pick<LiveSession, 'startedAt' | 'accum' | 'lastSeen'>, now: number): { accum: number; startedAt: number | null } {
  if (ls.startedAt === null) return { accum: ls.accum, startedAt: null };
  if (now - ls.lastSeen <= LIVE_GRACE_MS) return { accum: ls.accum, startedAt: ls.startedAt };
  return { accum: ls.accum + Math.max(0, Math.round((ls.lastSeen - ls.startedAt) / 1000)), startedAt: null };
}

type Sess = { id: string; title: string; meta: string; min: number; date: string; note?: string; rating?: number };
type Totals = { sessions: Sess[]; minutesByDate: Record<string, number>; totalMin: number };

export function applySessionUpdate<S extends Totals>(
  s: S,
  id: string,
  patch: { title?: string; meta?: string; min?: number; note?: string; rating?: number },
): S {
  const sess = s.sessions.find((x) => x.id === id);
  if (!sess) return s;
  const delta = patch.min !== undefined ? patch.min - sess.min : 0;
  return {
    ...s,
    sessions: s.sessions.map((x) =>
      x.id === id ? { ...x, ...patch, note: patch.note !== undefined ? patch.note.trim() || undefined : x.note } : x,
    ),
    totalMin: Math.max(0, s.totalMin + delta),
    minutesByDate:
      delta === 0
        ? s.minutesByDate
        : { ...s.minutesByDate, [sess.date]: Math.max(0, (s.minutesByDate[sess.date] ?? 0) + delta) },
  };
}
