// In-memory home for a running routine, so it survives tab switches and
// screen unmounts, and so the shell can show a "routine in progress" pill.
// Not persisted: an app kill ends the run, same as the practice timer.
import { useSyncExternalStore } from 'react';

export type ActiveRun = {
  planId: string;
  idx: number;
  /** Wall-clock start of the current stretch, or null while paused. */
  startedAt: number | null;
  /** Seconds accumulated before the current stretch (pause bookkeeping). */
  accum: number;
  /** Wall-clock start of the whole run, for the session review. */
  runStart: number;
};

let run: ActiveRun | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getActiveRun = () => run;
export const setActiveRun = (next: ActiveRun | null) => {
  run = next;
  listeners.forEach((l) => l());
};
export const useActiveRun = () => useSyncExternalStore(subscribe, getActiveRun, getActiveRun);
