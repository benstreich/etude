import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Session = { id: string; title: string; meta: string; min: number; date: string };
export type PieceStatus = 'Learning' | 'Polishing' | 'Ready';
export type Piece = { id: string; name: string; by: string; status: PieceStatus; pct: number };

export type WeekStart = 'Monday' | 'Sunday';

type Settings = {
  name: string;
  instruments: string[];
  breakDays: string[];
  reminder: string;
  weekStart: WeekStart;
};

type State = Settings & {
  minutesByDate: Record<string, number>;
  sessions: Session[];
  streak: number;
  bestStreak: number;
  lastPracticeDate: string | null;
  totalMin: number;
  pieces: Piece[];
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
      { id: uid(), title: 'Clair de Lune', meta: 'Today · Piece', min: 20, date: today },
      { id: uid(), title: 'Scales & arpeggios', meta: 'Today · Technique', min: 12, date: today },
    ],
    streak: 12,
    bestStreak: 21,
    lastPracticeDate: today,
    totalMin: 86 * 60,
    pieces: [
      { id: uid(), name: 'Clair de Lune', by: 'Debussy', status: 'Polishing', pct: 70 },
      { id: uid(), name: 'Autumn Leaves', by: 'Kosma', status: 'Learning', pct: 35 },
      { id: uid(), name: 'Prelude in C', by: 'Bach', status: 'Ready', pct: 100 },
      { id: uid(), name: 'Blue Bossa', by: 'Dorham', status: 'Learning', pct: 20 },
    ],
    dailyGoal: 45,
    name: 'Alex Rivera',
    instruments: ['Piano', 'Guitar'],
    breakDays: ['Sunday'],
    reminder: '7:00 PM',
    weekStart: 'Monday',
  };
}

const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' });

// Most recent day before today that isn't a break day — the day the streak
// must reach back to. Capped walk so all-break-days can't loop forever.
function prevExpectedKey(breakDays: string[]): string {
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    d.setDate(d.getDate() - 1);
    if (!breakDays.includes(dayName(d))) break;
  }
  return dateKey(d);
}

type Store = State & {
  todayMin: number;
  displayStreak: number;
  week: { day: string; min: number; isToday: boolean }[];
  toast: string | null;
  showToast: (msg: string) => void;
  logMinutes: (min: number, title: string, meta: string) => void;
  deleteSession: (id: string) => void;
  addPiece: (name: string) => void;
  cyclePiece: (id: string) => void;
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

  const logMinutes = (min: number, title: string, meta: string) => {
    setState((s) => {
      if (!s) return s;
      const today = dateKey();
      // streak survives gaps made only of break days
      const streak =
        s.lastPracticeDate === today
          ? s.streak
          : s.lastPracticeDate && s.lastPracticeDate >= prevExpectedKey(s.breakDays)
            ? s.streak + 1
            : 1;
      return {
        ...s,
        minutesByDate: { ...s.minutesByDate, [today]: (s.minutesByDate[today] ?? 0) + min },
        totalMin: s.totalMin + min,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        lastPracticeDate: today,
        sessions: [{ id: uid(), title, meta, min, date: today }, ...s.sessions],
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

  const addPiece = (name: string) => {
    setState((s) =>
      s ? { ...s, pieces: [{ id: uid(), name, by: '', status: 'Learning' as const, pct: 10 }, ...s.pieces] } : s
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

  const displayStreak =
    state.lastPracticeDate === today ||
    (state.lastPracticeDate !== null && state.lastPracticeDate >= prevExpectedKey(state.breakDays))
      ? state.streak
      : 0;

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
    updateSettings,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
