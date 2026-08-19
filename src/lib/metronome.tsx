// ponytail: the beat is scheduled by a JS timer that re-aims at the wall clock every
// tick, not by a sample-accurate audio thread. Good to a couple of ms, which is well
// under what anyone can hear against their own playing. Revisit only if someone can.
import { createAudioPlayer, requestNotificationPermissionsAsync, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import Controls from '../../modules/metronome-controls';
import { accentLevel, bpmAfter, clampBpm, parseSig, type Ramp, type TimeSig } from './metronome-math';
import { useStore } from './store';

const CLICK = require('../../assets/audio/click.wav');
const MID = require('../../assets/audio/click-mid.wav');
const ACCENT = require('../../assets/audio/click-accent.wav');

/** How much the lock-screen buttons move the tempo. */
export const LOCK_SCREEN_STEP = 5;

// --- click playback -------------------------------------------------------
// Two players per sound, used alternately: a player is rewound right after it
// fires, so the beat itself is a bare play() with no await in the way.

// bank index = accent level: 0 plain, 1 group start, 2 bar downbeat
let pool: AudioPlayer[][] | null = null;
const cursor = [0, 0, 0];

function ensurePool() {
  if (pool) return;
  const pair = (source: number) => [createAudioPlayer(source), createAudioPlayer(source)];
  pool = [pair(CLICK), pair(MID), pair(ACCENT)];
}

function playClick(bank: 0 | 1 | 2) {
  if (!pool) return;
  const players = pool[bank];
  const player = players[cursor[bank]++ % players.length];
  player.play();
  // rewind long before this player's turn comes round again (2 beats = 400ms at 300 BPM)
  setTimeout(() => {
    player.seekTo(0).catch(() => {});
  }, 150);
}

// --- beat pulse -----------------------------------------------------------
// Kept out of context on purpose: the provider wraps the whole app, and a
// context update per beat would re-render every screen four times a bar.

const beatListeners = new Set<(beat: number) => void>();
const emitBeat = (beat: number) => beatListeners.forEach((listener) => listener(beat));

/** Index of the current beat within the bar, or -1 while stopped. */
export function useBeat(): number {
  const [beat, setBeat] = useState(-1);
  useEffect(() => {
    beatListeners.add(setBeat);
    return () => {
      beatListeners.delete(setBeat);
    };
  }, []);
  return beat;
}

// --- provider -------------------------------------------------------------

type Run = {
  /** Start of the current ramp baseline - moved when the tempo is set by hand. */
  startedAt: number;
  baseBpm: number;
  baseBeats: number;
  /** Beats played since start; drives the bar accent, never rebased. */
  beats: number;
  /** Wall-clock target for the next tick. */
  nextAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

type Metronome = {
  running: boolean;
  /** Live tempo - equals the saved start tempo until a ramp moves it. */
  bpm: number;
  /** The saved tempo a run starts from; a ramp never moves this. */
  startBpm: number;
  timeSig: string;
  sig: TimeSig;
  ramp: Ramp;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setBpm: (bpm: number) => void;
  nudge: (by: number) => void;
  setTimeSig: (sig: string) => void;
  setRamp: (patch: Partial<Ramp>) => void;
};

const Ctx = createContext<Metronome | null>(null);

export function MetronomeProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [running, setRunning] = useState(false);
  const [bpm, setLiveBpm] = useState(store.metroBpm);
  const sig = useMemo(() => parseSig(store.metroTimeSig), [store.metroTimeSig]);

  const ramp: Ramp = useMemo(
    () => ({
      on: store.metroRampOn,
      step: store.metroRampStep,
      every: store.metroRampEvery,
      unit: store.metroRampUnit,
      target: store.metroRampTarget,
    }),
    [store.metroRampOn, store.metroRampStep, store.metroRampEvery, store.metroRampUnit, store.metroRampTarget]
  );

  const run = useRef<Run | null>(null);
  // latest config for the scheduler, which runs outside React's render cycle
  const latest = useRef({ bpm, sig, ramp, startBpm: store.metroBpm });
  latest.current = { bpm, sig, ramp, startBpm: store.metroBpm };

  const tick = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const { sig: liveSig, ramp: liveRamp } = latest.current;

    const index = r.beats;
    playClick(accentLevel(index, liveSig));
    emitBeat(index % liveSig.beats);
    r.beats = index + 1;

    const since = r.beats - r.baseBeats;
    const next = bpmAfter(r.baseBpm, liveRamp, {
      bars: Math.floor(since / liveSig.beats),
      seconds: (Date.now() - r.startedAt) / 1000,
    });
    setLiveBpm((current) => (current === next ? current : next));

    r.nextAt += 60000 / next;
    // after a long suspend, resync instead of firing a burst of catch-up clicks
    if (r.nextAt < Date.now() - 500) r.nextAt = Date.now() + 60000 / next;
    r.timer = setTimeout(tick, Math.max(0, r.nextAt - Date.now()));
  }, []);

  const start = useCallback(() => {
    if (run.current) return;
    ensurePool();
    const startBpm = latest.current.bpm;
    const now = Date.now();
    run.current = { startedAt: now, baseBpm: startBpm, baseBeats: 0, beats: 0, nextAt: now, timer: null };
    setRunning(true);
    Controls?.show({ bpm: startBpm, running: true });
    tick();
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(
      () => {}
    );
    if (Platform.OS === 'android') requestNotificationPermissionsAsync().catch(() => {});
  }, [tick]);

  const stop = useCallback(() => {
    if (run.current?.timer) clearTimeout(run.current.timer);
    run.current = null;
    setRunning(false);
    emitBeat(-1);
    Controls?.hide();
    setLiveBpm(latest.current.startBpm);
  }, []);

  const setBpm = useCallback(
    (next: number) => {
      const value = clampBpm(next);
      setLiveBpm(value);
      const r = run.current;
      if (r) {
        // mid-run the ramp restarts from here; the saved start tempo is left alone
        r.baseBpm = value;
        r.baseBeats = r.beats;
        r.startedAt = Date.now();
      } else {
        store.updateSettings({ metroBpm: value });
      }
    },
    [store]
  );

  const nudge = useCallback((by: number) => setBpm(latest.current.bpm + by), [setBpm]);
  const toggle = useCallback(() => (run.current ? stop() : start()), [start, stop]);

  const setTimeSig = useCallback((next: string) => store.updateSettings({ metroTimeSig: next }), [store]);

  const setRamp = useCallback(
    (patch: Partial<Ramp>) =>
      store.updateSettings({
        ...(patch.on !== undefined && { metroRampOn: patch.on }),
        ...(patch.step !== undefined && { metroRampStep: patch.step }),
        ...(patch.every !== undefined && { metroRampEvery: patch.every }),
        ...(patch.unit !== undefined && { metroRampUnit: patch.unit }),
        ...(patch.target !== undefined && { metroRampTarget: patch.target }),
      }),
    [store]
  );

  // lock screen / notification buttons
  useEffect(() => {
    const sub = Controls?.addListener('onCommand', ({ command }) => {
      if (command === 'inc') nudge(LOCK_SCREEN_STEP);
      else if (command === 'dec') nudge(-LOCK_SCREEN_STEP);
      else toggle();
    });
    return () => sub?.remove();
  }, [nudge, toggle]);

  useEffect(() => {
    if (running) Controls?.update({ bpm, running: true });
  }, [bpm, running]);

  // a stopped metronome follows the saved start tempo, including edits made elsewhere
  useEffect(() => {
    if (!run.current) setLiveBpm(store.metroBpm);
  }, [store.metroBpm]);

  useEffect(() => stop, [stop]);

  const value = useMemo<Metronome>(
    () => ({
      running,
      bpm,
      startBpm: store.metroBpm,
      timeSig: store.metroTimeSig,
      sig,
      ramp,
      start,
      stop,
      toggle,
      setBpm,
      nudge,
      setTimeSig,
      setRamp,
    }),
    [running, bpm, store.metroBpm, store.metroTimeSig, sig, ramp, start, stop, toggle, setBpm, nudge, setTimeSig, setRamp]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMetronome(): Metronome {
  const value = useContext(Ctx);
  if (!value) throw new Error('useMetronome must be used inside MetronomeProvider');
  return value;
}
