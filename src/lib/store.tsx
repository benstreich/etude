// ponytail: SQLite via kv-store — real .db file, AsyncStorage-compatible API.
// Move to relational tables if per-row queries ever matter.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';

import type { RampUnit } from './metronome-math';
import { computeStreak, dateKey, graceFor, type StreakMode } from './streak-math';

export { dateKey };

export type Session = { id: string; title: string; meta: string; min: number; date: string };
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
export type Piece = { id: string; name: string; by: string; stage: number; pct: number; archived?: boolean };

export type WeekStart = 'Monday' | 'Sunday';

type Settings = {
  name: string;
  instruments: string[];
  breakDays: string[];
  streakMode: StreakMode;
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
};

const KEY = 'etude-state-v1';

const uid = () => Math.random().toString(36).slice(2, 10);

function seed(): State {
  const minutesByDate: Record<string, number> = {};
  const mins = [42, 15, 0, 38, 45, 25, 32];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    minutesByDate[dateKey(d)] = mins[i];
  }
  const today = dateKey();
  return {
    minutesByDate,
    sessions: [
      { id: uid(), title: 'Clair de Lune', meta: 'Piece', min: 20, date: today },
      { id: uid(), title: 'Scales & arpeggios', meta: 'Technique', min: 12, date: today },
    ],
    bestStreak: 21,
    totalMin: 86 * 60,
    pieces: [
      { id: uid(), name: 'Clair de Lune', by: 'Debussy', stage: 1, pct: 70 },
      { id: uid(), name: 'Autumn Leaves', by: 'Kosma', stage: 0, pct: 35 },
      { id: uid(), name: 'Prelude in C', by: 'Bach', stage: 2, pct: 100 },
      { id: uid(), name: 'Blue Bossa', by: 'Dorham', stage: 0, pct: 20 },
    ],
    techniques: ['Scales & arpeggios', 'Sight reading'],
    recordings: [],
    dailyGoal: 45,
    name: 'Alex Rivera',
    instruments: ['Piano', 'Guitar'],
    breakDays: ['Sunday'],
    streakMode: 'strict',
    reminder: '7:00 PM',
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

// "Today", "Yesterday", or "Aug 12" for a dateKey
export function dayLabel(key: string): string {
  const today = dateKey();
  if (key === today) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dateKey(y)) return 'Yesterday';
  const [yy, mm, dd] = key.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Store = State & {
  todayMin: number;
  displayStreak: number;
  week: { day: string; min: number; isToday: boolean; date: string }[];
  toast: string | null;
  showToast: (msg: string) => void;
  logMinutes: (min: number, title: string, meta: string, date?: string) => void;
  deleteSession: (id: string) => void;
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
      if (!raw) return setState(seed());
      const saved = JSON.parse(raw);
      // merge over seed so states saved before new settings existed pick up defaults
      const merged: State = { ...seed(), ...saved };
      // legacy: pieces stored a named status before stages became a list
      const legacyStage: Record<string, number> = { Learning: 0, Polishing: 1, Ready: 2 };
      if (saved.stageLabels)
        merged.stages = (['Learning', 'Polishing', 'Ready'] as const).map((k) => saved.stageLabels[k] || k);
      if (saved.metroBeatsPerBar && !saved.metroTimeSig) merged.metroTimeSig = `${saved.metroBeatsPerBar}/4`;
      merged.pieces = merged.pieces.map((p: Piece & { status?: string }) => ({
        ...p,
        stage: p.stage ?? legacyStage[p.status ?? ''] ?? 0,
      }));
      setState(merged);
    };
    load();
  }, []);

  useEffect(() => {
    if (state) Storage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  if (!state) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const logMinutes = (min: number, title: string, meta: string, date = dateKey()) => {
    setState((s) => {
      if (!s) return s;
      const minutesByDate = { ...s.minutesByDate, [date]: (s.minutesByDate[date] ?? 0) + min };
      return {
        ...s,
        minutesByDate,
        totalMin: s.totalMin + min,
        bestStreak: Math.max(s.bestStreak, computeStreak(minutesByDate, s.breakDays, graceFor(s.streakMode))),
        sessions: [{ id: uid(), title, meta, min, date }, ...s.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)),
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
    setState((s) =>
      s ? { ...s, pieces: [{ id: uid(), name, by, stage: 0, pct: 10 }, ...s.pieces] } : s
    );
    showToast('Added to repertoire');
  };

  const addTechnique = (name: string) => {
    setState((s) => {
      if (!s || s.techniques.includes(name)) return s;
      return { ...s, techniques: [...s.techniques, name] };
    });
    showToast('Technique added');
  };

  const removeTechnique = (name: string) => {
    setState((s) => (s ? { ...s, techniques: s.techniques.filter((t) => t !== name) } : s));
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

  const today = dateKey();
  const todayMin = state.minutesByDate[today] ?? 0;

  const displayStreak = computeStreak(state.minutesByDate, state.breakDays, graceFor(state.streakMode));

  const removePiece = (id: string) => {
    setState((s) => (s ? { ...s, pieces: s.pieces.filter((p) => p.id !== id) } : s));
    showToast('Removed from repertoire');
  };

  const setArchived = (id: string, archived: boolean) => {
    setState((s) => (s ? { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, archived } : p)) } : s));
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
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dateKey(d);
    return { day: letters[d.getDay()], min: state.minutesByDate[key] ?? 0, isToday: i === 6, date: key };
  });

  const store: Store = {
    ...state,
    todayMin,
    displayStreak,
    week,
    toast,
    showToast,
    logMinutes,
    deleteSession,
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
