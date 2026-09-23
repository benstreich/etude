// In-memory home for a running routine, so it survives tab switches and
// screen unmounts, and so the shell can show a "routine in progress" pill.
// Not persisted: an app kill ends the run, same as the practice timer.
import { useSyncExternalStore } from 'react';

import type { Plan } from './store';

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

// A plan that is run without ever being saved (#95: "Suggested for today").
// It lives here, beside the run, so the runner and the RunPill resolve it the
// same way from any screen; it is never persisted, and renamePiece never has to
// rewrite it because it is dropped the moment it is not mid-run.
export const TRANSIENT_PLAN_ID = 'suggested';
let transient: Plan | null = null;
export const getTransientPlan = () => transient;
export const setTransientPlan = (next: Plan | null) => {
  transient = next;
  listeners.forEach((l) => l());
};
export const useTransientPlan = () => useSyncExternalStore(subscribe, getTransientPlan, getTransientPlan);
/** The plan for an id: the store's, or the transient one when the id is TRANSIENT_PLAN_ID. */
export const resolvePlan = (plans: Plan[], id: string | undefined): Plan | undefined => {
  const t = getTransientPlan();
  if (id === TRANSIENT_PLAN_ID && t) return t;
  return plans.find((p) => p.id === id);
};
