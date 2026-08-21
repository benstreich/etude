// ponytail: SQLite via kv-store — real .db file, AsyncStorage-compatible API.
// Move to relational tables if per-row queries ever matter.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

import type { RampUnit } from './metronome-math';
import { migrate } from './migrate';
import { syncReminder } from './reminders';
import { applySessionUpdate } from './session-math';
import { computeBestStreak, computeStreak, dateKey, graceFor, type StreakMode } from './streak-math';
import type { AccentName, RadiusMode, ThemeMode } from './theme';

export { dateKey };

export type Session = { id: string; title: string; meta: string; min: number; date: string; note?: string; planId?: string };
export type PlanSegment = { focus: { name: string; kind: 'Piece' | 'Technique' }; note?: string; bpm?: number; min: number };
export type Plan = { id: string; name: string; segments: PlanSegment[] };
export type TempoEntry = { date: string; bpm: number };
// wave: ~60 normalized (0..1) mic levels sampled while recording, for the waveform display
export type Recording = {
  id: string;
  piece: string;
  date: string;
  at?: number;
  name?: string;
  uri: string;
  sec: number;
  wave?: number[];
  starred?: boolean;
};
// stage is an index into settings.stages
export type Piece = {
  id: string;
  name: string;
  by: string;
  stage: number;
  pct: number;
  archived?: boolean;
  addedAt?: number;
  currentBpm?: number;
  targetBpm?: number;
  tempoLog?: TempoEntry[]; // kept sorted ascending by date, one entry per day
};

export type FocusPeriod = '7d' | '30d' | 'all';

export type WeekStart = 'Monday' | 'Sunday';

type Settings = {
  onboarded: boolean;
  focusPeriod: FocusPeriod; // Progress "time by focus" filter, persisted
  name: string;
  instruments: string[];
  breakDays: string[];
  streakMode: StreakMode;
  theme: ThemeMode;
  accent: AccentName;
  fontScale: number;
  radius: RadiusMode;
  reduceMotion: boolean;
  reminder: string;
  weekStart: WeekStart;
  quickLog: number[];
  quickLogFocus: { name: string; kind: 'Piece' | 'Technique' } | null;
  stages: string[]; // ordered; last stage counts as "ready"
  // Metronome. Flat rather than nested so the shallow seed merge below backfills
  // each key on its own when an install predates it.
  metroBpm: number; // the tempo a run starts at; a ramp moves the live one, not this
  metroTimeSig: string; // e.g. '6/8'; parsed by metronome-math.parseSig
  metroRampOn: boolean;
  metroRampStep: number; // BPM per step, always positive
  metroRampEvery: number;
  metroRampUnit: RampUnit;
  metroRampTarget: number; // below metroBpm means the ramp runs downwards
};

type State = Settings & {
  minutesByDate: Record<string, number>;
  sessions: Session[];
  bestStreak: number;
  totalMin: number;
  pieces: Piece[];
  techniques: string[];
  dailyGoal: number;
  recordings: Recording[];
  plans: Plan[];
};

const KEY = 'etude-state-v1';

const uid = () => Math.random().toString(36).slice(2, 10);

// The user's data starts empty — a fresh install must never show someone else's
// stats. Only settings carry real defaults (migrate backfills them on upgrades).
function seed(): State {
  return {
    minutesByDate: {},
    sessions: [],
    bestStreak: 0,
    totalMin: 0,
    pieces: [],
    techniques: ['Scales & arpeggios', 'Sight reading'],
    recordings: [],
    plans: [],
    dailyGoal: 45,
    onboarded: false,
    focusPeriod: '30d',
    name: '',
    instruments: [],
    breakDays: ['Sunday'],
    streakMode: 'strict',
    theme: 'system',
    accent: 'terracotta',
    fontScale: 1,
    radius: 'soft',
    reduceMotion: false,
    // 'Off' until onboarding asks — a seeded time would fire the OS permission
    // prompt at first launch, before the reminders step gets to explain itself
    reminder: 'Off',
    weekStart: 'Monday',
    quickLog: [15, 30, 45],
    quickLogFocus: null,
    stages: ['Learning', 'Polishing', 'Ready'],
    metroBpm: 90,
    metroTimeSig: '4/4',
    metroRampOn: false,
    metroRampStep: 2,
    metroRampEvery: 4,
    metroRampUnit: 'bars',
    metroRampTarget: 120,
  };
}

// "Today", "Yesterday", or "Aug 12" for a dateKey. todayKey comes from the
// store so callers re-render (and re-memoize) when the day rolls over.
export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  const [ty, tm, td] = todayKey.split('-').map(Number);
  if (key === dateKey(new Date(ty, tm - 1, td - 1))) return 'Yesterday';
  const [yy, mm, dd] = key.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Recordings persist a documents-relative path: absolute URIs rot on iOS, where
// the app container UUID changes on every update. Anything that still has a
// scheme (blob:, http:, a legacy file:// not under documents) passes through.
const docUri = () => {
  try {
    const d = Paths.document.uri;
    return d.endsWith('/') ? d : `${d}/`;
  } catch {
    return ''; // web
  }
};
export const toStoredUri = (uri: string) => {
  const d = docUri();
  return d && uri.startsWith(d) ? uri.slice(d.length) : uri;
};
export const resolveRecordingUri = (stored: string) => (stored.includes(':') ? stored : docUri() + stored);

type Store = State & {
  /** Wall clock, refreshed on foreground and at midnight — the reactive "now" for date math. */
  now: number;
  /** dateKey of the current day, derived from `now`. */
  today: string;
  todayMin: number;
  displayStreak: number;
  week: { day: string; min: number; isToday: boolean; date: string }[];
  toast: string | null;
  showToast: (msg: string) => void;
  logMinutes: (min: number, title: string, meta: string, date?: string, planId?: string) => string;
  addPlan: (name: string) => string;
  updatePlan: (id: string, patch: Partial<Pick<Plan, 'name' | 'segments'>>) => void;
  removePlan: (id: string) => void;
  /** Upserts today's (or `date`'s) tempo entry for a piece and mirrors it into currentBpm. */
  logTempo: (pieceId: string, bpm: number, date?: string) => void;
  deleteTempoEntry: (pieceId: string, date: string) => void;
  deleteSession: (id: string) => void;
  setSessionNote: (id: string, note: string) => void;
  updateSession: (id: string, patch: { title?: string; meta?: string; min?: number; note?: string }) => void;
  updatePiece: (id: string, patch: Partial<Pick<Piece, 'stage' | 'currentBpm' | 'targetBpm'>>) => void;
  /** Restore-from-backup: replaces everything, running the blob through migrate() first. */
  restoreBackup: (stateObj: object) => void;
  /** The persisted state only — what a backup file should contain. */
  backupState: () => State;
  addPiece: (name: string, by?: string) => void;
  addTechnique: (name: string) => void;
  removeTechnique: (name: string) => void;
  cyclePiece: (id: string) => void;
  removePiece: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  addRecording: (piece: string, uri: string, sec: number, wave?: number[]) => void;
  toggleStar: (id: string) => void;
  deleteRecording: (id: string) => void;
  renameRecording: (id: string, name: string) => void;
  updateSettings: (patch: Partial<Settings & { dailyGoal: number }>) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Reactive clock: without it, render-body dates freeze (react-compiler caches
  // zero-dep expressions) and the whole UI shows yesterday after midnight.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    // ponytail: one timer re-armed each midnight; clock jumps are caught by the foreground refresh
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const next = new Date();
      next.setHours(24, 0, 0, 500);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, next.getTime() - Date.now());
    };
    arm();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // one-time move from AsyncStorage to SQLite for existing installs
    const load = async () => {
      let raw = await Storage.getItem(KEY);
      if (!raw) {
        try {
          const legacy = (await import('@react-native-async-storage/async-storage')).default;
          raw = await legacy.getItem(KEY);
        } catch {}
      }
      setState(migrate(raw, seed()));
    };
    // a storage read that throws must never leave the app on a blank screen forever
    load().catch(() => setState(seed()));
  }, []);

  useEffect(() => {
    if (state)
      Storage.setItem(KEY, JSON.stringify(state)).catch(() =>
        setToast('Save failed — device storage may be full')
      );
  }, [state]);

  // keep the scheduled daily notification in sync with the setting; also runs
  // on app start, so a permission granted later in system settings self-heals
  const reminder = state?.reminder;
  useEffect(() => {
    if (reminder === undefined) return;
    syncReminder(reminder)
      .then((ok) => {
        if (ok) return;
        setToast('Enable notifications in system settings to get reminders');
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2400);
      })
      .catch(() => {});
  }, [reminder]);


  if (!state) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const logMinutes = (min: number, title: string, meta: string, date = dateKey(), planId?: string) => {
    const id = uid();
    setState((s) => {
      if (!s) return s;
      const minutesByDate = { ...s.minutesByDate, [date]: (s.minutesByDate[date] ?? 0) + min };
      return {
        ...s,
        minutesByDate,
        totalMin: s.totalMin + min,
        // full-history scan so streaks assembled from backdated logs count too
        bestStreak: Math.max(s.bestStreak, computeBestStreak(minutesByDate, s.breakDays, graceFor(s.streakMode))),
        sessions: [{ id, title, meta, min, date, planId }, ...s.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)),
      };
    });
    return id;
  };

  const addPlan = (name: string) => {
    const id = uid();
    setState((s) => (s ? { ...s, plans: [...s.plans, { id, name, segments: [] }] } : s));
    return id;
  };

  const updatePlan: Store['updatePlan'] = (id, patch) => {
    setState((s) => (s ? { ...s, plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : s));
  };

  const removePlan = (id: string) => {
    setState((s) => (s ? { ...s, plans: s.plans.filter((p) => p.id !== id) } : s));
    showToast('Plan deleted');
  };

  const logTempo: Store['logTempo'] = (pieceId, bpm, date = dateKey()) => {
    setState((s) =>
      s
        ? {
            ...s,
            pieces: s.pieces.map((p) => {
              if (p.id !== pieceId) return p;
              const log = (p.tempoLog ?? []).filter((e) => e.date !== date);
              log.push({ date, bpm });
              log.sort((a, b) => (a.date < b.date ? -1 : 1));
              return { ...p, tempoLog: log, currentBpm: bpm };
            }),
          }
        : s
    );
  };

  const deleteTempoEntry: Store['deleteTempoEntry'] = (pieceId, date) => {
    setState((s) =>
      s
        ? {
            ...s,
            pieces: s.pieces.map((p) =>
              p.id === pieceId ? { ...p, tempoLog: (p.tempoLog ?? []).filter((e) => e.date !== date) } : p
            ),
          }
        : s
    );
  };

  const setSessionNote = (id: string, note: string) => {
    setState((s) =>
      s ? { ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, note: note.trim() || undefined } : x)) } : s
    );
  };

  const updateSession: Store['updateSession'] = (id, patch) => {
    setState((s) => (s ? applySessionUpdate(s, id, patch) : s));
  };

  const updatePiece: Store['updatePiece'] = (id, patch) => {
    setState((s) => {
      if (!s) return s;
      const n = s.stages.length;
      return {
        ...s,
        pieces: s.pieces.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch };
          // same pct rule as cyclePiece so the repertoire bar stays consistent
          if (patch.stage !== undefined)
            next.pct = patch.stage === 0 ? 20 : Math.round(((Math.min(patch.stage, n - 1) + 1) / n) * 100);
          return next;
        }),
      };
    });
  };

  const deleteSession = (id: string) => {
    setState((s) => {
      if (!s) return s;
      const sess = s.sessions.find((x) => x.id === id);
      if (!sess) return s;
      const dayMin = s.minutesByDate[sess.date];
      return {
        ...s,
        sessions: s.sessions.filter((x) => x.id !== id),
        totalMin: Math.max(0, s.totalMin - sess.min),
        minutesByDate:
          dayMin === undefined ? s.minutesByDate : { ...s.minutesByDate, [sess.date]: Math.max(0, dayMin - sess.min) },
      };
    });
    showToast('Session deleted');
  };

  const addPiece = (name: string, by = '') => {
    const clean = name.trim();
    // piece identity elsewhere is the display name — a duplicate doubles stats and recordings
    const dup = state.pieces.some((p) => p.name.trim().toLowerCase() === clean.toLowerCase());
    if (!dup)
      setState((s) =>
        s ? { ...s, pieces: [{ id: uid(), name: clean, by, stage: 0, pct: 10, addedAt: Date.now() }, ...s.pieces] } : s
      );
    showToast(dup ? 'Already in repertoire' : 'Added to repertoire');
  };

  const addTechnique = (name: string) => {
    setState((s) => {
      if (!s || s.techniques.includes(name)) return s;
      return { ...s, techniques: [...s.techniques, name] };
    });
    showToast('Technique added');
  };

  // a removed focus target must not keep collecting quick-log sessions
  const clearFocus = (s: State, name: string, kind: 'Piece' | 'Technique') =>
    s.quickLogFocus?.kind === kind && s.quickLogFocus.name === name ? null : s.quickLogFocus;

  const removeTechnique = (name: string) => {
    setState((s) =>
      s
        ? { ...s, techniques: s.techniques.filter((t) => t !== name), quickLogFocus: clearFocus(s, name, 'Technique') }
        : s
    );
  };

  const cyclePiece = (id: string) => {
    setState((s) => {
      if (!s) return s;
      const n = s.stages.length;
      return {
        ...s,
        pieces: s.pieces.map((p) => {
          if (p.id !== id) return p;
          const stage = (Math.min(p.stage, n - 1) + 1) % n;
          return { ...p, stage, pct: stage === 0 ? 20 : Math.round(((stage + 1) / n) * 100) };
        }),
      };
    });
  };

  const todayDate = new Date(now);
  const today = dateKey(todayDate);
  const todayMin = state.minutesByDate[today] ?? 0;

  const displayStreak = computeStreak(state.minutesByDate, state.breakDays, graceFor(state.streakMode), todayDate);

  const removePiece = (id: string) => {
    setState((s) => {
      if (!s) return s;
      const gone = s.pieces.find((p) => p.id === id);
      return {
        ...s,
        pieces: s.pieces.filter((p) => p.id !== id),
        quickLogFocus: gone ? clearFocus(s, gone.name, 'Piece') : s.quickLogFocus,
      };
    });
    showToast('Removed from repertoire');
  };

  const setArchived = (id: string, archived: boolean) => {
    setState((s) => {
      if (!s) return s;
      const target = s.pieces.find((p) => p.id === id);
      return {
        ...s,
        pieces: s.pieces.map((p) => (p.id === id ? { ...p, archived } : p)),
        quickLogFocus: archived && target ? clearFocus(s, target.name, 'Piece') : s.quickLogFocus,
      };
    });
    showToast(archived ? 'Archived' : 'Restored');
  };

  const addRecording = (piece: string, uri: string, sec: number, wave?: number[]) => {
    setState((s) =>
      s
        ? { ...s, recordings: [{ id: uid(), piece, uri, sec, wave, date: dateKey(), at: Date.now() }, ...s.recordings] }
        : s
    );
    showToast('Recording saved');
  };

  const toggleStar = (id: string) => {
    setState((s) =>
      s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, starred: !r.starred } : r)) } : s
    );
  };

  const deleteRecording = (id: string) => {
    setState((s) => (s ? { ...s, recordings: s.recordings.filter((r) => r.id !== id) } : s));
    showToast('Recording deleted');
  };

  const renameRecording = (id: string, name: string) => {
    setState((s) =>
      s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)) } : s
    );
  };

  const updateSettings: Store['updateSettings'] = (patch) => {
    setState((s) => {
      if (!s) return s;
      const next = { ...s, ...patch };
      // fewer stages than before → clamp pieces so no index dangles
      if (patch.stages)
        next.pieces = next.pieces.map((p) => ({ ...p, stage: Math.min(p.stage, patch.stages!.length - 1) }));
      return next;
    });
  };

  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const key = dateKey(d);
    return { day: letters[d.getDay()], min: state.minutesByDate[key] ?? 0, isToday: i === 6, date: key };
  });

  const store: Store = {
    ...state,
    now,
    today,
    todayMin,
    displayStreak,
    week,
    toast,
    showToast,
    logMinutes,
    addPlan,
    updatePlan,
    removePlan,
    logTempo,
    deleteTempoEntry,
    deleteSession,
    setSessionNote,
    updateSession,
    updatePiece,
    restoreBackup: (stateObj: object) => setState(migrate(JSON.stringify(stateObj), seed())),
    backupState: () => state,
    addPiece,
    addTechnique,
    removeTechnique,
    cyclePiece,
    removePiece,
    setArchived,
    addRecording,
    deleteRecording,
    renameRecording,
    toggleStar,
    updateSettings,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
