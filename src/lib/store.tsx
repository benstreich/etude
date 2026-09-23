// ponytail: SQLite via kv-store — real .db file, AsyncStorage-compatible API.
// Move to relational tables if per-row queries ever matter.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

import { forPiece, type Attachment } from './attachment-math';
import { removeFolderIn, renameFolderIn, validFolderName } from './folder-math';
import type { LadderConfig } from './ladder-math';
import { pieceInstruments } from './instrument-math';
import { deleteAttachmentFiles } from './attachments';
import { runAutoBackup } from './backup';
import { primaryOf } from './cue-voice';
import { success } from './haptics';
import { resolveRecordingUri, toStoredUri } from './doc-path';
import { i18n, resolveLang, tr, type Lang, type LanguageSetting } from './i18n';
import type { RampUnit } from './metronome-math';
import type { MelodyKey } from './melody';
import { migrate } from './migrate';
import { syncReminder } from './reminders';
import { schedule, type SpotGrade } from './repetition-math';
import { applySessionUpdate, type LiveSession } from './session-math';
import { appendStageLog } from './movement-math';
import { stagePct } from './stage-math';
import { computeBestStreak, computeStreak, dateKey, graceFor, type StreakMode } from './streak-math';
import type { AccentName, RadiusMode, ThemeMode } from './theme';

export { dateKey };
export { resolveRecordingUri, toStoredUri };
export type { Attachment };
export type { SpotGrade };

// spot (#91): the TroubleSpot.id this session was logged against; unset = the whole piece.
// A deleted spot leaves its id behind here — display code treats an unknown id as "no spot".
export type Session = { id: string; title: string; meta: string; min: number; date: string; note?: string; planId?: string; rating?: number; at?: number; instrument?: string; spot?: string };
// kind 'Break' (#59): a rest — no focus, never logged, excluded from the saved session total
export type PlanSegment = { focus: { name: string; kind: 'Piece' | 'Technique' | 'Break' }; note?: string; bpm?: number; min: number };
export type Plan = { id: string; name: string; segments: PlanSegment[] };
export type TempoEntry = { date: string; bpm: number };
export type StageEntry = { date: string; stage: number };
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
  // non-destructive trim, in seconds from the start of the file (the audio itself
  // is AAC/m4a — nothing on device can re-encode it, so playback honours these)
  start?: number;
  end?: number;
  loop?: boolean;
  rate?: number; // playback speed, 1 = normal; pitch is corrected so it stays in tune
};
// A named passage of a piece that needs separate work (#91). Sessions reference
// it by `id`, so a rename of the label or of the piece never orphans a session.
export type TroubleSpot = {
  id: string;
  label: string;
  note?: string;
  addedAt: string; // dateKey
  resolvedAt?: string; // set when marked solid; deleted again to reopen
  // Spaced repetition (#93): the Leitner box 0..4 decides the interval, dueAt is
  // when the spot comes back. Backfilled by migrate for spots that predate it.
  box: number;
  dueAt: string; // dateKey
  gradedAt?: string; // dateKey of the last again/good/easy
  // reserved: a page of a score attachment to open at. ScoreViewer is keyed by
  // attachment, not page, so nothing reads this yet — stored so the shape is settled.
  attachment?: { id: string; page: number };
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
  instrument?: string; // #58; first of `instruments`, kept for older data and the CSV
  instruments?: string[]; // #58; every instrument this is played on. Empty/unset = all of them
  targetDate?: string; // dateKey the piece should reach the last stage by (#56)
  targetRating?: number; // 1-5 rolling-average star target for the deadline (spec 2026-09-15)
  tempoLog?: TempoEntry[]; // kept sorted ascending by date, one entry per day
  stageLog?: StageEntry[]; // every stage change, ascending, one per day; backfilled by migrate (spec 2026-09-15)
  folder?: string; // #102; a name from settings.folders. Unset = ungrouped
  ladder?: LadderConfig; // #90; clean-pass auto-advance. Absent = LADDER_DEFAULTS, never written back
  kind?: 'Piece' | 'Technique'; // #83: unset = Piece. A technique is a piece too — same page, stages, tempo, recordings
  artwork?: string; // album cover URL from the iTunes search that added the piece
  spots?: TroubleSpot[]; // #91; absent = none. Optional, so older blobs need no migration
};

export type FocusPeriod = '7d' | '30d' | 'all';

export type WeekStart = 'Monday' | 'Sunday';

type Settings = {
  onboarded: boolean;
  installedAt: number; // first hydration on this device, ms; the review prompt (#68) counts from here
  reviewPromptedAt: number; // 0 until the automatic review sheet has been asked for once (#68)
  autoBackupDays: number; // 0 = off; otherwise auto backup every N days into Documents/Backups
  focusPeriod: FocusPeriod; // Progress "time by focus" filter, persisted
  progressLayout: { key: string; on: boolean }[]; // section order + visibility; [] = registry default (spec 2026-09-15)
  progressHintSeen: boolean; // the one-time "this tab is yours" hint under the progress header
  progressChart: 'calendar' | 'line' | 'bars'; // how the heatmap card draws the same minutes
  suggestDismissed: string; // dateKey of the day the "Suggested for today" card was dismissed (#95); '' = never
  name: string;
  language: LanguageSetting; // 'system' follows the device locale
  instruments: string[];
  primaryInstrument: string; // '' = first in the list; picks the session cue's voice (#53)
  instrumentFilter: string; // '' = all; the last instrument chosen in Practice/Repertoire/Progress (#58)
  breakEvery: number; // minutes between break reminders in the free timer; 0 = off (#59)
  breakDays: string[];
  streakMode: StreakMode;
  theme: ThemeMode;
  accent: AccentName;
  fontScale: number;
  radius: RadiusMode;
  reduceMotion: boolean;
  sounds: boolean; // the two audio-identity cues; see lib/sounds.ts
  showTechniques: boolean; // list techniques alongside pieces in Repertoire
  reminder: string;
  weekStart: WeekStart;
  quickLog: number[];
  // Period goals in minutes; 0 = derive from dailyGoal × practice days (#56)
  weeklyGoal: number;
  monthlyGoal: number;
  yearlyGoal: number;
  quickLogFocus: { name: string; kind: 'Piece' | 'Technique' } | null;
  stages: string[]; // ordered; last stage counts as "ready"
  // #102. Ordered and user-editable like `stages`; [] = no folders, and the
  // repertoire renders flat. `collapsedFolders` persists the chevrons, the same
  // way showTechniques persists its one section.
  folders: string[];
  collapsedFolders: string[];
  // Metronome. Flat rather than nested so the shallow seed merge below backfills
  // each key on its own when an install predates it.
  metroBpm: number; // the tempo a run starts at; a ramp moves the live one, not this
  metroTimeSig: string; // e.g. '6/8'; parsed by metronome-math.parseSig
  metroRampOn: boolean;
  metroRampStep: number; // BPM per step, always positive
  metroRampEvery: number;
  metroRampUnit: RampUnit;
  metroRampTarget: number; // below metroBpm means the ramp runs downwards
  metroSubdiv: number; // clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths
  metroAccents: number[]; // level per beat of the bar: 0 muted, 1 plain, 2 mid, 3 accent
  metroSound: string; // sample set id from metronome-math SOUND_SETS
  metroVolume: number; // 0-100, the click's own gain under the system volume
  // Tuner. Flat like the metronome keys, same reason.
  tunerInstrument: string; // an id from tuner-math INSTRUMENTS
  melodyKey: MelodyKey; // the key Home's melody staff is read and played in
  tunerRefA: number; // reference pitch in Hz, 415–445
};

type State = Settings & {
  minutesByDate: Record<string, number>;
  sessions: Session[];
  bestStreak: number;
  totalMin: number;
  pieces: Piece[];
  dailyGoal: number;
  recordings: Recording[];
  attachments: Attachment[]; // sheet music / photos per piece (#60)
  plans: Plan[];
  // the session in flight, if one is: persisted so a process death cannot lose
  // it. Practice restores it on mount (session-math.restoreLive).
  liveSession: LiveSession | null;
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
    // two starter techniques so the Practice picker isn't bare — ordinary pieces of
    // kind 'Technique' (#83), deletable like any other
    pieces: [
      { id: 'tech-scales', name: 'Scales & arpeggios', by: '', stage: 0, pct: 10, kind: 'Technique' },
      { id: 'tech-sight', name: 'Sight reading', by: '', stage: 0, pct: 10, kind: 'Technique' },
    ],
    recordings: [],
    attachments: [],
    plans: [],
    liveSession: null,
    // onboarding's goal step starts from this; its copy says start easy, and 30
    // still is — a real session that survives a busy day, so goal-met and the
    // streak keep meaning something
    dailyGoal: 30,
    weeklyGoal: 0,
    monthlyGoal: 0,
    yearlyGoal: 0,
    onboarded: false,
    installedAt: 0,
    reviewPromptedAt: 0,
    autoBackupDays: 0,
    focusPeriod: '30d',
    progressLayout: [],
    progressHintSeen: false,
    progressChart: 'calendar',
    suggestDismissed: '',
    name: '',
    language: 'system',
    instruments: [],
    primaryInstrument: '',
    instrumentFilter: '',
    breakEvery: 0,
    breakDays: ['Sunday'],
    streakMode: 'strict',
    theme: 'system',
    accent: 'terracotta',
    fontScale: 1,
    radius: 'soft',
    reduceMotion: false,
    sounds: true,
    showTechniques: true,
    // 'Off' until onboarding asks — a seeded time would fire the OS permission
    // prompt at first launch, before the reminders step gets to explain itself
    reminder: 'Off',
    weekStart: 'Monday',
    quickLog: [15, 30, 45],
    quickLogFocus: null,
    stages: ['Learning', 'Polishing', 'Ready'],
    folders: [],
    collapsedFolders: [],
    metroBpm: 90,
    metroTimeSig: '4/4',
    metroRampOn: false,
    metroRampStep: 2,
    metroRampEvery: 4,
    metroRampUnit: 'bars',
    metroRampTarget: 120,
    metroSubdiv: 1,
    metroAccents: [], // empty = "whatever the signature implies"; the sheet fills it in on first edit
    metroSound: 'wood',
    metroVolume: 100,
    tunerInstrument: 'chromatic',
    melodyKey: 'C',
    tunerRefA: 440,
  };
}

// "Today", "Yesterday", or "Aug 12" for a dateKey. todayKey comes from the
// store so callers re-render (and re-memoize) when the day rolls over.
// t/lang come from the store too, so labels re-render on language change.
export function dayLabel(key: string, todayKey: string, t: Store['t'], lang: Lang): string {
  if (key === todayKey) return t('common.today');
  const [ty, tm, td] = todayKey.split('-').map(Number);
  if (key === dateKey(new Date(ty, tm - 1, td - 1))) return t('common.yesterday');
  const [yy, mm, dd] = key.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString(lang, { month: 'short', day: 'numeric' });
}


type Store = State & {
  /** Translate a key from src/locales — identity from the store so language changes re-render. */
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Resolved UI language ('en' | 'de'), also the locale for date formatting. */
  lang: Lang;
  /** Wall clock, refreshed on foreground and at midnight — the reactive "now" for date math. */
  now: number;
  /** dateKey of the current day, derived from `now`. */
  today: string;
  todayMin: number;
  displayStreak: number;
  week: { day: string; min: number; isToday: boolean; date: string }[];
  toast: string | null;
  showToast: (msg: string) => void;
  /** `spot` (#91): the TroubleSpot id the minutes went to; omit for the whole piece. */
  logMinutes: (min: number, title: string, meta: string, date?: string, planId?: string, instrument?: string, spot?: string) => string;
  addPlan: (name: string) => string;
  updatePlan: (id: string, patch: Partial<Pick<Plan, 'name' | 'segments'>>) => void;
  removePlan: (id: string) => void;
  /** Upserts today's (or `date`'s) tempo entry for a piece and mirrors it into currentBpm. */
  logTempo: (pieceId: string, bpm: number, date?: string) => void;
  deleteTempoEntry: (pieceId: string, date: string) => void;
  deleteSession: (id: string) => void;
  setSessionNote: (id: string, note: string) => void;
  /** Writes (or clears) the session in flight; every change is persisted at once. */
  setLiveSession: (ls: LiveSession | null) => void;
  updateSession: (id: string, patch: { title?: string; meta?: string; min?: number; note?: string; rating?: number }) => void;
  updatePiece: (id: string, patch: Partial<Pick<Piece, 'stage' | 'currentBpm' | 'targetBpm' | 'targetDate' | 'targetRating' | 'instrument' | 'instruments' | 'artwork' | 'ladder'>>) => void;
  // Trouble spots (#91). Resolve and reopen go through updateSpot by setting or
  // clearing `resolvedAt`; a patch with `resolvedAt: undefined` deletes the field.
  addSpot: (pieceId: string, label: string, note?: string) => void;
  updateSpot: (pieceId: string, spotId: string, patch: Partial<TroubleSpot>) => void;
  /** Past sessions keep their `spot` id; only the spot itself goes. */
  removeSpot: (pieceId: string, spotId: string) => void;
  /** #93: again / good / easy moves the spot's Leitner box and reschedules it from today. */
  gradeSpot: (pieceId: string, spotId: string, grade: SpotGrade) => void;
  /** Restore-from-backup: replaces everything, running the blob through migrate() first. */
  restoreBackup: (stateObj: object) => void;
  /** The persisted state only — what a backup file should contain. */
  backupState: () => State;
  addPiece: (name: string, by?: string, instrument?: string, artwork?: string) => void;
  addTechnique: (name: string) => void;
  removeTechnique: (name: string) => void;
  /** Every piece including techniques; `pieces` alone is the repertoire proper (#83). */
  allPieces: Piece[];
  /** Active technique names, derived from the pieces of kind 'Technique'. */
  techniques: string[];
  cyclePiece: (id: string) => void;
  /** Renames a piece or technique and everything that joins on its name; false if the name is empty or taken. */
  renamePiece: (id: string, name: string) => boolean;
  removePiece: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  // #102. Folders are names, not ids: `piece.folder` holds one, so a rename has to
  // cascade — which is why these are store actions and not updateSettings patches.
  setPieceFolder: (id: string, folder: string | null) => void;
  /** False when the name is blank, too long, already taken, or one folder too many — the caller toasts. */
  addFolder: (name: string) => boolean;
  renameFolder: (from: string, to: string) => boolean;
  /** Drops the folder and un-files its pieces. The pieces themselves are kept. */
  removeFolder: (name: string) => void;
  toggleFolderCollapsed: (name: string) => void;
  /** `name` is set for imported takes, which arrive with a filename worth keeping. */
  // trim: auto-detected silence bounds (#88), non-destructive like every other trim
  addRecording: (piece: string, uri: string, sec: number, wave?: number[], name?: string, trim?: { start: number; end: number }) => void;
  toggleStar: (id: string) => void;
  deleteRecording: (id: string) => void;
  renameRecording: (id: string, name: string) => void;
  moveRecording: (id: string, piece: string) => void;
  updateRecording: (id: string, patch: Partial<Recording>) => void;
  addAttachments: (list: Attachment[]) => void;
  renameAttachment: (id: string, name: string) => void;
  deleteAttachment: (id: string) => void;
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

  const lang = resolveLang(state?.language ?? 'system');
  // t closes over lang (no singleton mutation during render); the singleton's
  // locale is synced in an effect for non-React callers like reminders
  const t: Store['t'] = (key, opts) => i18n.t(key, { locale: lang, ...opts });
  useEffect(() => {
    i18n.locale = lang;
  }, [lang]);

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
      const next = migrate(raw, seed());
      // first hydration stamps the install; upgrades from before the field count from the upgrade
      setState(next.installedAt > 0 ? next : { ...next, installedAt: Date.now() });
    };
    // a storage read that throws must never leave the app on a blank screen forever
    load().catch(() => setState(seed()));
  }, []);

  useEffect(() => {
    if (state)
      Storage.setItem(KEY, JSON.stringify(state)).catch(() =>
        setToast(tr('toast.saveFailed'))
      );
  }, [state]);

  // keep the scheduled daily notification in sync with the setting; also runs
  // on app start, so a permission granted later in system settings self-heals
  const reminder = state?.reminder;
  const reminderSound = state?.sounds ?? true;
  useEffect(() => {
    if (reminder === undefined) return;
    syncReminder(reminder, reminderSound)
      .then((ok) => {
        if (ok) return;
        setToast(tr('toast.enableNotifications'));
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2400);
      })
      .catch(() => {});
  }, [reminder, reminderSound]);

  // auto backup, checked once per hydration / foreground / midnight / setting
  // change — not per state change, so it's not a sync dir scan on every edit
  const hydrated = state !== null;
  const autoBackupDays = state?.autoBackupDays ?? 0;
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (stateRef.current && autoBackupDays > 0)
      runAutoBackup(stateRef.current, autoBackupDays, dateKey(new Date(now)));
  }, [hydrated, autoBackupDays, now]);

  if (!state) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const logMinutes: Store['logMinutes'] = (min, title, meta, date = dateKey(), planId, instrument, spot) => {
    const id = uid();
    // wall-clock start only for sessions logged on the day itself; backdated logs have no time of day
    const at = date === dateKey() ? Date.now() : undefined;
    // read off the live state before the update: a goal crossing or a streak
    // growing are read-only questions about what this log is about to change,
    // not part of computing the next state itself
    const before = state.minutesByDate[date] ?? 0;
    const after = before + min;
    const goalCrossed = before < state.dailyGoal && after >= state.dailyGoal;
    const grace = graceFor(state.streakMode);
    const streakGrew =
      computeStreak({ ...state.minutesByDate, [date]: after }, state.breakDays, grace, new Date(now)) >
      computeStreak(state.minutesByDate, state.breakDays, grace, new Date(now));
    setState((s) => {
      if (!s) return s;
      // #58: which instrument this session was on. The caller knows best — the same
      // piece or technique can be practised on two instruments, and only the player
      // can say which one today was. Falling back to the piece's tag, then the
      // primary, keeps every existing caller behaving as it did.
      const piece = s.pieces.find((p) => p.name === title);
      const on = instrument || (piece ? pieceInstruments(piece)[0] : undefined) || primaryOf(s.instruments, s.primaryInstrument) || undefined;
      const minutesByDate = { ...s.minutesByDate, [date]: (s.minutesByDate[date] ?? 0) + min };
      return {
        ...s,
        minutesByDate,
        totalMin: s.totalMin + min,
        // full-history scan so streaks assembled from backdated logs count too
        bestStreak: Math.max(s.bestStreak, computeBestStreak(minutesByDate, s.breakDays, graceFor(s.streakMode))),
        // 0 on equal dates keeps the sort stable, so today's newest stays first
        // #91: only a spot still open on this piece is logged against — one resolved
        // or deleted mid-session falls back to the whole piece. Written only when
        // present, so a whole-piece session serializes exactly as before.
        sessions: [{ id, title, meta, min, date, planId, at, instrument: on, ...(spot && piece?.spots?.some((sp) => sp.id === spot && !sp.resolvedAt) ? { spot } : {}) }, ...s.sessions].sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
    // two events landing in the same instant read as one long buzz; a streak
    // growing on the same log that met the goal gets its own moment instead
    if (goalCrossed) success();
    if (streakGrew) {
      if (goalCrossed) setTimeout(success, 900);
      else success();
    }
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
    showToast(t('toast.planDeleted'));
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

  // Trouble spots (#91) live on the piece; one helper maps the piece and its list
  const withSpots = (pieceId: string, f: (spots: TroubleSpot[]) => TroubleSpot[]) =>
    setState((s) => (s ? { ...s, pieces: s.pieces.map((p) => (p.id === pieceId ? { ...p, spots: f(p.spots ?? []) } : p)) } : s));

  const addSpot: Store['addSpot'] = (pieceId, label, note) => {
    const clean = label.trim();
    if (!clean) return;
    const cleanNote = note?.trim();
    // a new spot is due at once (#93): the first session on it is the first review
    const today = dateKey();
    withSpots(pieceId, (spots) => [...spots, { id: uid(), label: clean, addedAt: today, box: 0, dueAt: today, ...(cleanNote ? { note: cleanNote } : {}) }]);
  };

  const gradeSpot: Store['gradeSpot'] = (pieceId, spotId, grade) => {
    const today = dateKey();
    withSpots(pieceId, (spots) => spots.map((sp) => (sp.id === spotId ? { ...sp, ...schedule(sp.box, grade, today), gradedAt: today } : sp)));
  };

  const updateSpot: Store['updateSpot'] = (pieceId, spotId, patch) => {
    withSpots(pieceId, (spots) =>
      spots.map((sp) => {
        if (sp.id !== spotId) return sp;
        const next = { ...sp, ...patch };
        // an explicit undefined means "drop the field" — that is how reopen clears resolvedAt
        for (const k of Object.keys(patch) as (keyof TroubleSpot)[]) if (patch[k] === undefined) delete next[k];
        if (typeof next.label === 'string') next.label = next.label.trim() || sp.label;
        if (typeof next.note === 'string' && !next.note.trim()) delete next.note;
        return next;
      })
    );
  };

  const removeSpot: Store['removeSpot'] = (pieceId, spotId) => {
    withSpots(pieceId, (spots) => spots.filter((sp) => sp.id !== spotId));
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

  const setLiveSession = (ls: LiveSession | null) => {
    setState((s) => (s ? { ...s, liveSession: ls } : s));
  };

  const updateSession: Store['updateSession'] = (id, patch) => {
    setState((s) => {
      if (!s) return s;
      const next = applySessionUpdate(s, id, patch);
      if (next === s || patch.min === undefined) return next;
      // an edited day can complete a streak, same monotonic bump as logMinutes
      return {
        ...next,
        bestStreak: Math.max(next.bestStreak, computeBestStreak(next.minutesByDate, next.breakDays, graceFor(next.streakMode))),
      };
    });
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
          if (patch.stage !== undefined) {
            next.pct = stagePct(patch.stage, n);
            next.stageLog = appendStageLog(p.stageLog, dateKey(), patch.stage);
          }
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
    showToast(t('toast.sessionDeleted'));
  };

  // Pieces and techniques share one list (#83). Identity elsewhere is the display
  // name, so a case- or space-different twin would silently split its stats and
  // recordings — the duplicate check spans both kinds. Techniques stay untagged by
  // instrument unless the user tags them, so they show under every instrument.
  const insertPiece = (kind: 'Piece' | 'Technique', name: string, by = '', instrument?: string, artwork?: string) => {
    const clean = name.trim();
    const dup = state.pieces.some((p) => p.name.trim().toLowerCase() === clean.toLowerCase());
    if (!dup)
      setState((s) =>
        s
          ? {
              ...s,
              pieces: [
                {
                  id: uid(),
                  name: clean,
                  by,
                  stage: 0,
                  pct: 10,
                  addedAt: Date.now(),
                  kind,
                  ...(artwork ? { artwork } : {}),
                  instrument: instrument ?? (kind === 'Piece' ? primaryOf(s.instruments, s.primaryInstrument) || undefined : undefined),
                },
                ...s.pieces,
              ],
            }
          : s
      );
    return dup;
  };

  const addPiece: Store['addPiece'] = (name, by = '', instrument, artwork) => {
    const dup = insertPiece('Piece', name, by, instrument, artwork);
    showToast(t(dup ? 'toast.alreadyInRepertoire' : 'toast.addedToRepertoire'));
  };

  const addTechnique = (name: string) => {
    if (!name.trim()) return;
    const dup = insertPiece('Technique', name);
    showToast(t(dup ? 'toast.alreadyInRepertoire' : 'toast.techniqueAdded'));
  };

  // a removed focus target must not keep collecting quick-log sessions
  const clearFocus = (s: State, name: string, kind: 'Piece' | 'Technique') =>
    s.quickLogFocus?.kind === kind && s.quickLogFocus.name === name ? null : s.quickLogFocus;

  const cyclePiece = (id: string) => {
    setState((s) => {
      if (!s) return s;
      const n = s.stages.length;
      return {
        ...s,
        pieces: s.pieces.map((p) => {
          if (p.id !== id) return p;
          const stage = (Math.min(p.stage, n - 1) + 1) % n;
          return { ...p, stage, pct: stagePct(stage, n), stageLog: appendStageLog(p.stageLog, dateKey(), stage) };
        }),
      };
    });
  };

  const todayDate = new Date(now);
  const today = dateKey(todayDate);
  const todayMin = state.minutesByDate[today] ?? 0;

  const displayStreak = computeStreak(state.minutesByDate, state.breakDays, graceFor(state.streakMode), todayDate);

  // sessions, recordings, plans and the quick-log focus all join on the name, so a
  // rename rewrites every one of them in the same update. False when the name is taken.
  // Trouble spots (#91) need nothing here on purpose: they live on the piece, and
  // sessions reference them by spot id, so neither key moves with the name.
  const renamePiece: Store['renamePiece'] = (id, name) => {
    const clean = name.trim();
    if (!clean) return false;
    const me = state.pieces.find((p) => p.id === id);
    if (!me || me.name === clean) return true;
    if (state.pieces.some((p) => p.id !== id && p.name.trim().toLowerCase() === clean.toLowerCase())) {
      showToast(t('toast.alreadyInRepertoire'));
      return false;
    }
    const old = me.name;
    const kind = me.kind ?? 'Piece';
    setState((s) =>
      s
        ? {
            ...s,
            pieces: s.pieces.map((p) => (p.id === id ? { ...p, name: clean } : p)),
            sessions: s.sessions.map((x) => (x.title === old ? { ...x, title: clean } : x)),
            recordings: s.recordings.map((r) => (r.piece === old ? { ...r, piece: clean } : r)),
            attachments: s.attachments.map((a) => (a.piece === old ? { ...a, piece: clean } : a)),
            plans: s.plans.map((pl) => ({ ...pl, segments: pl.segments.map((seg) => (seg.focus.name === old && seg.focus.kind === kind ? { ...seg, focus: { ...seg.focus, name: clean } } : seg)) })),
            quickLogFocus: s.quickLogFocus?.name === old && s.quickLogFocus.kind === kind ? { ...s.quickLogFocus, name: clean } : s.quickLogFocus,
          }
        : s
    );
    return true;
  };

  const removePiece = (id: string) => {
    setState((s) => {
      if (!s) return s;
      const gone = s.pieces.find((p) => p.id === id);
      // the piece's scores go with it, files included — nothing orphaned in attachments/
      const orphaned = gone ? forPiece(s.attachments, gone.name) : [];
      deleteAttachmentFiles(orphaned.map((a) => a.id));
      return {
        ...s,
        pieces: s.pieces.filter((p) => p.id !== id),
        attachments: orphaned.length ? s.attachments.filter((a) => !orphaned.includes(a)) : s.attachments,
        quickLogFocus: gone ? clearFocus(s, gone.name, gone.kind ?? 'Piece') : s.quickLogFocus,
      };
    });
    showToast(t('toast.removedFromRepertoire'));
  };

  /** The add-sheet chips toggle by name; removing deletes the technique piece like any other (#83). */
  const removeTechnique = (name: string) => {
    const tech = state.pieces.find((p) => p.kind === 'Technique' && p.name === name);
    if (tech) removePiece(tech.id);
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
    showToast(t(archived ? 'toast.archived' : 'toast.restored'));
  };

  const setPieceFolder: Store['setPieceFolder'] = (id, folder) => {
    setState((s) =>
      s ? { ...s, pieces: s.pieces.map((p) => (p.id === id ? { ...p, folder: folder ?? undefined } : p)) } : s
    );
  };

  const addFolder: Store['addFolder'] = (name) => {
    const valid = validFolderName(name, state?.folders ?? []);
    if (!valid) return false;
    setState((s) => (s ? { ...s, folders: [...s.folders, valid] } : s));
    return true;
  };

  const renameFolder: Store['renameFolder'] = (from, to) => {
    // the folder being renamed is not its own duplicate, so it comes out of the list first
    const valid = validFolderName(to, (state?.folders ?? []).filter((f) => f !== from));
    if (!valid) return false;
    setState((s) => {
      if (!s) return s;
      const { folders, pieces } = renameFolderIn(s.folders, s.pieces, from, valid);
      return { ...s, folders, pieces, collapsedFolders: s.collapsedFolders.map((f) => (f === from ? valid : f)) };
    });
    return true;
  };

  const removeFolder: Store['removeFolder'] = (name) => {
    setState((s) => {
      if (!s) return s;
      const { folders, pieces } = removeFolderIn(s.folders, s.pieces, name);
      // drop the collapse flag too, or a folder created with the same name later
      // would come back already shut
      return { ...s, folders, pieces, collapsedFolders: s.collapsedFolders.filter((f) => f !== name) };
    });
    showToast(t('toast.folderRemoved'));
  };

  const toggleFolderCollapsed: Store['toggleFolderCollapsed'] = (name) => {
    setState((s) =>
      s
        ? {
            ...s,
            collapsedFolders: s.collapsedFolders.includes(name)
              ? s.collapsedFolders.filter((f) => f !== name)
              : [...s.collapsedFolders, name],
          }
        : s
    );
  };

  const addRecording: Store['addRecording'] = (piece, uri, sec, wave, name, trim) => {
    setState((s) =>
      s
        ? { ...s, recordings: [{ id: uid(), piece, uri, sec, wave, date: dateKey(), at: Date.now(), ...(name ? { name } : {}), ...(trim ?? {}) }, ...s.recordings] }
        : s
    );
    showToast(t('toast.recordingSaved'));
  };

  const toggleStar = (id: string) => {
    setState((s) =>
      s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, starred: !r.starred } : r)) } : s
    );
  };

  const deleteRecording = (id: string) => {
    setState((s) => (s ? { ...s, recordings: s.recordings.filter((r) => r.id !== id) } : s));
    showToast(t('toast.recordingDeleted'));
  };

  const renameRecording = (id: string, name: string) => {
    setState((s) =>
      s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)) } : s
    );
  };

  // recordings join pieces by name, so re-homing a take is a rename of that field
  const moveRecording: Store['moveRecording'] = (id, piece) => {
    setState((s) => (s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, piece } : r)) } : s));
    showToast(t('toast.recordingMoved', { piece }));
  };

  const updateRecording: Store['updateRecording'] = (id, patch) => {
    setState((s) => (s ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : s));
  };

  const addAttachments: Store['addAttachments'] = (list) => {
    if (list.length === 0) return;
    setState((s) => (s ? { ...s, attachments: [...list, ...s.attachments] } : s));
    showToast(t('toast.scoreAdded', { count: list.length }));
  };

  const renameAttachment: Store['renameAttachment'] = (id, name) => {
    const clean = name.trim();
    if (!clean) return;
    setState((s) =>
      s ? { ...s, attachments: s.attachments.map((a) => (a.id === id ? { ...a, name: clean } : a)) } : s
    );
  };

  const deleteAttachment: Store['deleteAttachment'] = (id) => {
    deleteAttachmentFiles([id]);
    setState((s) => (s ? { ...s, attachments: s.attachments.filter((a) => a.id !== id) } : s));
    showToast(t('toast.scoreDeleted'));
  };

  const updateSettings: Store['updateSettings'] = (patch) => {
    setState((s) => {
      if (!s) return s;
      const next = { ...s, ...patch };
      // stages changed → clamp the index so none dangles, and rescale pct with it,
      // otherwise the bar keeps the old scale while the label moves (e.g. 3→4
      // stages left a "Polishing" piece showing 100%)
      if (patch.stages) {
        const n = patch.stages.length;
        next.pieces = next.pieces.map((p) => {
          const stage = Math.min(p.stage, n - 1);
          return { ...p, stage, pct: stagePct(stage, n), stageLog: stage === p.stage ? p.stageLog : appendStageLog(p.stageLog, dateKey(), stage) };
        });
      }
      return next;
    });
  };

  const letters = t('common.dayLetters').split(''); // Sun..Sat initials
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const key = dateKey(d);
    return { day: letters[d.getDay()], min: state.minutesByDate[key] ?? 0, isToday: i === 6, date: key };
  });

  const store: Store = {
    ...state,
    // #83: `pieces` is the repertoire proper; techniques ride along as pieces of kind 'Technique'
    pieces: state.pieces.filter((p) => p.kind !== 'Technique'),
    allPieces: state.pieces,
    techniques: state.pieces.filter((p) => p.kind === 'Technique' && !p.archived).map((p) => p.name),
    t,
    lang,
    now,
    today,
    todayMin,
    displayStreak,
    week,
    toast,
    showToast,
    logMinutes,
    setLiveSession,
    addPlan,
    updatePlan,
    removePlan,
    logTempo,
    deleteTempoEntry,
    addSpot,
    updateSpot,
    removeSpot,
    gradeSpot,
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
    renamePiece,
    removePiece,
    setArchived,
    setPieceFolder,
    addFolder,
    renameFolder,
    removeFolder,
    toggleFolderCollapsed,
    addRecording,
    deleteRecording,
    renameRecording,
    moveRecording,
    updateRecording,
    addAttachments,
    renameAttachment,
    deleteAttachment,
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
