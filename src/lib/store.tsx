import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Session = { id: string; title: string; meta: string; min: number; date: string };
export type PieceStatus = 'Learning' | 'Polishing' | 'Ready';
export type Piece = { id: string; name: string; by: string; status: PieceStatus; pct: number; archived?: boolean };

export type WeekStart = 'Monday' | 'Sunday';

type Settings = {
  name: string;
  instruments: string[];
  breakDays: string[];
  reminder: string;
  weekStart: WeekStart;
  quickLog: number[];
};

type State = Settings & {
  minutesByDate: Record<string, number>;
  sessions: Session[];
  bestStreak: number;
  totalMin: number;
  pieces: Piece[];
  techniques: string[];
  dailyGoal: number;
};

const KEY = 'etude-state-v1';

export const dateKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
      { id: uid(), name: 'Clair de Lune', by: 'Debussy', status: 'Polishing', pct: 70 },
      { id: uid(), name: 'Autumn Leaves', by: 'Kosma', status: 'Learning', pct: 35 },
      { id: uid(), name: 'Prelude in C', by: 'Bach', status: 'Ready', pct: 100 },
      { id: uid(), name: 'Blue Bossa', by: 'Dorham', status: 'Learning', pct: 20 },
    ],
    techniques: ['Scales & arpeggios', 'Sight reading'],
    dailyGoal: 45,
    name: 'Alex Rivera',
    instruments: ['Piano', 'Guitar'],
    breakDays: ['Sunday'],
    reminder: '7:00 PM',
    weekStart: 'Monday',
    quickLog: [15, 30, 45],
  };
}

const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' });

// Streak derived from history so backdated logs count too. A practiced break
// day extends it; an unpracticed break day is skipped; a 0-minute today
// doesn't break it (the day isn't over yet).
function computeStreak(minutesByDate: Record<string, number>, breakDays: string[]): number {
  let streak = 0;
  const d = new Date();
  if (!((minutesByDate[dateKey(d)] ?? 0) > 0)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    if ((minutesByDate[dateKey(d)] ?? 0) > 0) streak++;
    else if (!breakDays.includes(dayName(d))) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
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
  week: { day: string; min: number; isToday: boolean }[];
  toast: string | null;
  showToast: (msg: string) => void;
  logMinutes: (min: number, title: string, meta: string, date?: string) => void;
  deleteSession: (id: string) => void;
  addPiece: (name: string, by?: string) => void;
  cyclePiece: (id: string) => void;
  removePiece: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  updateSettings: (patch: Partial<Settings & { dailyGoal: number }>) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // merge over seed so states saved before new settings existed pick up defaults
    AsyncStorage.getItem(KEY).then((raw) => setState(raw ? { ...seed(), ...JSON.parse(raw) } : seed()));
  }, []);

  useEffect(() => {
    if (state) AsyncStorage.setItem(KEY, JSON.stringify(state));
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
        bestStreak: Math.max(s.bestStreak, computeStreak(minutesByDate, s.breakDays)),
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
      s ? { ...s, pieces: [{ id: uid(), name, by, status: 'Learning' as const, pct: 10 }, ...s.pieces] } : s
    );
    showToast('Added to repertoire');
  };

  const cyclePiece = (id: string) => {
    const next: Record<PieceStatus, { status: PieceStatus; pct: number }> = {
      Learning: { status: 'Polishing', pct: 70 },
      Polishing: { status: 'Ready', pct: 100 },
      Ready: { status: 'Learning', pct: 20 },
    };
    setState((s) =>
      s ? { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, ...next[p.status] } : p)) } : s
    );
  };

  const today = dateKey();
  const todayMin = state.minutesByDate[today] ?? 0;

  const displayStreak = computeStreak(state.minutesByDate, state.breakDays);

  const removePiece = (id: string) => {
    setState((s) => (s ? { ...s, pieces: s.pieces.filter((p) => p.id !== id) } : s));
    showToast('Removed from repertoire');
  };

  const setArchived = (id: string, archived: boolean) => {
    setState((s) => (s ? { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, archived } : p)) } : s));
    showToast(archived ? 'Archived' : 'Restored');
  };

  const updateSettings: Store['updateSettings'] = (patch) => {
    setState((s) => (s ? { ...s, ...patch } : s));
  };

  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { day: i === 6 ? 'Today' : letters[d.getDay()], min: state.minutesByDate[dateKey(d)] ?? 0, isToday: i === 6 };
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
    cyclePiece,
    removePiece,
    setArchived,
    updateSettings,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
