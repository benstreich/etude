// ponytail: the beat is scheduled by a JS timer that re-aims at the wall clock every
// tick, not by a sample-accurate audio thread. Good to a couple of ms, which is well
// under what anyone can hear against their own playing. Revisit only if someone can.
import { createAudioPlayer, requestNotificationPermissionsAsync, type AudioPlayer } from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import Controls from '../../modules/metronome-controls';
import { applyAudioMode } from './audio-mode';
import {
  accentLevel,
  advanceTick,
  bpmAfter,
  clampBpm,
  clampSound,
  clampSubdiv,
  clampVolume,
  cycleLevel,
  fitAccents,
  parseSig,
  SOUND_SETS,
  volumeGain,
  type Level,
  type Ramp,
  type SoundSet,
  type Subdiv,
  type TimeSig,
} from './metronome-math';
import { useStore } from './store';

// The four samples of a set, in the order both the JS pool and the Kotlin
// SoundPool index them: plain, group start, downbeat, subdivision.
const SAMPLES: Record<SoundSet, number[]> = {
  wood: [
    require('../../assets/audio/wood_beat.wav'),
    require('../../assets/audio/wood_mid.wav'),
    require('../../assets/audio/wood_accent.wav'),
    require('../../assets/audio/wood_sub.wav'),
  ],
  click: [
    require('../../assets/audio/click_beat.wav'),
    require('../../assets/audio/click_mid.wav'),
    require('../../assets/audio/click_accent.wav'),
    require('../../assets/audio/click_sub.wav'),
  ],
  beep: [
    require('../../assets/audio/beep_beat.wav'),
    require('../../assets/audio/beep_mid.wav'),
    require('../../assets/audio/beep_accent.wav'),
    require('../../assets/audio/beep_sub.wav'),
  ],
  soft: [
    require('../../assets/audio/soft_beat.wav'),
    require('../../assets/audio/soft_mid.wav'),
    require('../../assets/audio/soft_accent.wav'),
    require('../../assets/audio/soft_sub.wav'),
  ],
  rim: [
    require('../../assets/audio/rim_beat.wav'),
    require('../../assets/audio/rim_mid.wav'),
    require('../../assets/audio/rim_accent.wav'),
    require('../../assets/audio/rim_sub.wav'),
  ],
};

/** Bank index for a level; the subdivision click is bank 3. */
const SUB_BANK = 3;
const bankFor = (level: Level) => level - 1; // 1 plain → 0, 2 mid → 1, 3 accent → 2

/** How much the lock-screen buttons move the tempo. */
export const LOCK_SCREEN_STEP = 5;

// --- click playback -------------------------------------------------------
// Android (dev build): the native SoundPool, the same engine the background loop
// uses, so in-app and lock-screen clicks are the same click (#78). expo-audio's
// ExoPlayer smeared the onset of these 30 ms samples — quiet and thin in the
// app, and its rewind replayed them as a fast double.
// Elsewhere: two expo-audio players per sound, used alternately; a player is
// rewound right after it fires, so the beat itself is a bare play().
// ponytail: pools are built per sound set on first use and kept — five sets of
// eight players is cheap, and rebuilding one mid-run would drop a click.

const nativeClicks = typeof Controls?.click === 'function';
const pools: Partial<Record<SoundSet, AudioPlayer[][]>> = {};
const cursor = [0, 0, 0, 0];

function ensurePool(set: SoundSet) {
  if (nativeClicks) return Controls!.preloadClicks!();
  if (pools[set]) return;
  const pair = (source: number) => [createAudioPlayer(source), createAudioPlayer(source)];
  pools[set] = SAMPLES[set].map(pair);
}

function playClick(set: SoundSet, bank: number, volume: number) {
  if (nativeClicks) return Controls!.click!({ sound: set, bank, volume });
  const gain = volumeGain(volume);
  const pool = pools[set];
  if (!pool || gain <= 0) return;
  const players = pool[bank];
  const player = players[cursor[bank]++ % players.length];
  player.volume = gain;
  player.play();
  // rewind long before this player's turn comes round again (2 beats = 400ms at 300 BPM)
  setTimeout(() => {
    player.seekTo(0).catch(() => {});
  }, 150);
}

/**
 * Build every set's player pool ahead of time (#78). createAudioPlayer loads
 * asynchronously, so a pool built on the picker tap fired its first click late —
 * right on top of the next beat, which sounded like a double click.
 */
export function preloadClicks() {
  for (const set of SOUND_SETS) ensurePool(set);
}

/** One click of a set at full tilt, for the picker's preview tap. */
export function previewClick(set: SoundSet, volume: number) {
  ensurePool(set);
  playClick(set, bankFor(3), volume);
}

// Module-level mirror of `running` so non-React callers (the sound cues, which
// must never talk over the click) can ask without a context.
let metroRunning = false;
export const metronomeRunning = () => metroRunning;

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
  /** Subdivision ticks played inside the current beat; 0 means the beat itself. */
  sub: number;
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
  /** Clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
  subdiv: Subdiv;
  /** Level per beat of the bar, always the full length of the signature. */
  accents: Level[];
  sound: SoundSet;
  /** 0-100, the metronome's own gain under the system volume. */
  volume: number;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setBpm: (bpm: number) => void;
  nudge: (by: number) => void;
  setTimeSig: (sig: string) => void;
  setRamp: (patch: Partial<Ramp>) => void;
  setSubdiv: (n: number) => void;
  /** Tap a beat dot: accent → mid → plain → muted → accent. */
  cycleAccent: (beat: number) => void;
  setSound: (set: SoundSet) => void;
  setVolume: (pct: number) => void;
};

const Ctx = createContext<Metronome | null>(null);

export function MetronomeProvider({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const [running, setRunning] = useState(false);
  const [bpm, setLiveBpm] = useState(store.metroBpm);
  const sig = useMemo(() => parseSig(store.metroTimeSig), [store.metroTimeSig]);
  const subdiv = clampSubdiv(store.metroSubdiv);
  const sound = clampSound(store.metroSound);
  const volume = clampVolume(store.metroVolume);
  // stored empty until the user edits a bar, so a new signature just works
  const accents = useMemo(() => fitAccents(store.metroAccents, sig), [store.metroAccents, sig]);

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
  const latest = useRef({ bpm, sig, ramp, subdiv, accents, sound, volume, startBpm: store.metroBpm });
  useEffect(() => {
    latest.current = { bpm, sig, ramp, subdiv, accents, sound, volume, startBpm: store.metroBpm };
  });

  // Everything the native background loop needs to sound like the in-app one.
  // Pass the live run to hand the loop over mid-bar: the service then picks the
  // next tick up where the JS timer would have fired it, instead of restarting
  // the bar with a click on top of the one JS had just played (#83).
  const tickConfig = useCallback((from?: Run) => {
    const l = latest.current;
    const config = { bpm: l.bpm, pattern: l.accents, subdiv: l.subdiv, sound: l.sound, volume: l.volume };
    if (!from) return config;
    return { ...config, beat: from.beats, sub: from.sub, startIn: Math.max(0, from.nextAt - Date.now()) };
  }, []);

  // Fires once per subdivision tick. The beat counter only moves on `sub === 0`,
  // so the ramp below still measures whole beats however finely we are clicking.
  const tick = useCallback(function tickFn() {
    const r = run.current;
    if (!r) return;
    const { sig: liveSig, ramp: liveRamp, subdiv: n, accents: bar, sound: set, volume: vol } = latest.current;

    if (r.sub === 0) {
      const level = accentLevel(r.beats, liveSig, bar);
      if (level > 0) playClick(set, bankFor(level), vol); // 0 = the user muted this beat
      emitBeat(r.beats % liveSig.beats);
    } else {
      playClick(set, SUB_BANK, vol);
    }

    const pos = advanceTick(r, n);
    r.beats = pos.beats;
    r.sub = pos.sub;

    const since = r.beats - r.baseBeats;
    const next = bpmAfter(r.baseBpm, liveRamp, {
      bars: Math.floor(since / liveSig.beats),
      seconds: (Date.now() - r.startedAt) / 1000,
    });
    setLiveBpm((current) => (current === next ? current : next));

    const interval = 60000 / next / n;
    r.nextAt += interval;
    // after a long suspend, resync instead of firing a burst of catch-up clicks
    if (r.nextAt < Date.now() - 500) r.nextAt = Date.now() + interval;
    r.timer = setTimeout(tickFn, Math.max(0, r.nextAt - Date.now()));
  }, []);

  const start = useCallback(() => {
    if (run.current) return;
    ensurePool(latest.current.sound);
    const startBpm = latest.current.bpm;
    const now = Date.now();
    run.current = { startedAt: now, baseBpm: startBpm, baseBeats: 0, beats: 0, sub: 0, nextAt: now, timer: null };
    metroRunning = true;
    setRunning(true);
    Controls?.show({ bpm: startBpm, running: true });
    if (Platform.OS === 'android' && AppState.currentState !== 'active') {
      // started from the lock screen — JS timers are frozen, the service clicks
      Controls?.startTicking(tickConfig());
    } else {
      tick();
    }
    applyAudioMode({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
    if (Platform.OS === 'android')
      requestNotificationPermissionsAsync()
        .then(() => {
          // Android 13+: a notification posted before the grant was silently dropped — repaint
          if (run.current) Controls?.update({ bpm: latest.current.bpm, running: true });
        })
        .catch(() => {});
  }, [tick, tickConfig]);

  const stop = useCallback(() => {
    if (run.current?.timer) clearTimeout(run.current.timer);
    run.current = null;
    metroRunning = false;
    setRunning(false);
    emitBeat(-1);
    Controls?.stopTicking();
    Controls?.hide();
    setLiveBpm(latest.current.startBpm);
  }, []);

  // The lock-screen Pause: unlike stop(), the controls stay up (so the user can
  // resume from there) and the live tempo is kept instead of reset.
  const pause = useCallback(() => {
    const r = run.current;
    if (!r) return;
    if (r.timer) clearTimeout(r.timer);
    run.current = null;
    metroRunning = false;
    setRunning(false);
    emitBeat(-1);
    Controls?.stopTicking();
    Controls?.update({ bpm: latest.current.bpm, running: false });
  }, []);

  const setBpm = useCallback(
    (next: number) => {
      const value = clampBpm(next);
      setLiveBpm(value);
      const r = run.current;
      if (r) {
        // mid-run the ramp restarts from here, so it climbs from the new tempo
        // rather than replaying the whole run in one jump
        r.baseBpm = value;
        r.baseBeats = r.beats;
        r.startedAt = Date.now();
      }
      // Setting the tempo is deliberate, so it sticks even mid-run — stopping
      // used to snap back to the tempo you started at and lose it (#44). A ramp
      // moving the tempo on its own still doesn't: it must restart from its base.
      store.updateSettings({ metroBpm: value });
    },
    [store]
  );

  const nudge = useCallback((by: number) => setBpm(latest.current.bpm + by), [setBpm]);
  const toggle = useCallback(() => (run.current ? stop() : start()), [start, stop]);

  // a new signature drops any edited bar: an accent on beat 5 means nothing in 3/4
  const setTimeSig = useCallback(
    (next: string) => store.updateSettings({ metroTimeSig: next, metroAccents: [] }),
    [store]
  );

  const setSubdiv = useCallback(
    (n: number) => {
      const value = clampSubdiv(n);
      // land on the next beat rather than mid-figure, so the pulse never limps
      if (run.current) run.current.sub = 0;
      store.updateSettings({ metroSubdiv: value });
    },
    [store]
  );

  const cycleAccent = useCallback(
    (beat: number) => {
      const bar = [...latest.current.accents];
      if (beat < 0 || beat >= bar.length) return;
      bar[beat] = cycleLevel(bar[beat]);
      store.updateSettings({ metroAccents: bar });
    },
    [store]
  );

  const setSound = useCallback(
    (set: SoundSet) => {
      ensurePool(set);
      store.updateSettings({ metroSound: clampSound(set) });
    },
    [store]
  );

  const setVolume = useCallback((pct: number) => store.updateSettings({ metroVolume: clampVolume(pct) }), [store]);

  const setRamp = useCallback(
    (patch: Partial<Ramp>) => {
      const r = run.current;
      if (r) {
        // a ramp edited mid-run measures from now at the current tempo, like setBpm —
        // otherwise the whole elapsed run is applied retroactively in one jump
        r.baseBpm = latest.current.bpm;
        r.baseBeats = r.beats;
        r.startedAt = Date.now();
      }
      store.updateSettings({
        ...(patch.on !== undefined && { metroRampOn: patch.on }),
        ...(patch.step !== undefined && { metroRampStep: patch.step }),
        ...(patch.every !== undefined && { metroRampEvery: patch.every }),
        ...(patch.unit !== undefined && { metroRampUnit: patch.unit }),
        ...(patch.target !== undefined && { metroRampTarget: patch.target }),
      });
    },
    [store]
  );

  // lock screen / notification buttons — their Pause pauses (controls stay up),
  // it must not stop() and hide the only way back in
  useEffect(() => {
    const sub = Controls?.addListener('onCommand', ({ command }) => {
      if (command === 'inc') nudge(LOCK_SCREEN_STEP);
      else if (command === 'dec') nudge(-LOCK_SCREEN_STEP);
      else if (run.current) pause();
      else start();
    });
    return () => sub?.remove();
  }, [nudge, pause, start]);

  // Android freezes JS timers whenever the activity pauses (screen off, home
  // button) — hand the click loop to the foreground service and take it back on
  // resume. The position travels both ways, so a run backgrounded on beat 3 of
  // a bar is still on beat 3 when it comes back, and neither handover doubles a
  // click. ponytail: the service counts beats for us, so a bars-based ramp keeps
  // climbing in the background too — it is applied at the next JS tick.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (state) => {
      const r = run.current;
      if (state === 'active') {
        // where the service got to, so the bar carries on rather than restarting
        const at = Controls?.stopTicking();
        if (r && r.timer === null) {
          if (at) {
            r.beats = at.beat;
            r.sub = at.sub;
          }
          const wait = at ? at.nextIn : 60000 / latest.current.bpm / latest.current.subdiv;
          r.nextAt = Date.now() + wait;
          r.timer = setTimeout(tick, wait);
        }
      } else if (r) {
        if (r.timer) clearTimeout(r.timer);
        r.timer = null;
        Controls?.startTicking(tickConfig(r));
      }
    });
    return () => sub.remove();
  }, [tick, tickConfig]);

  useEffect(() => {
    if (running) Controls?.update({ bpm, running: true });
  }, [bpm, running]);

  // the native loop keeps ticking while backgrounded — push edits made from the
  // sheet (or a widget) straight at it, or the lock screen drifts out of step
  useEffect(() => {
    if (running) Controls?.updateTicking(tickConfig());
  }, [running, subdiv, accents, sound, volume, tickConfig]);

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
      subdiv,
      accents,
      sound,
      volume,
      start,
      stop,
      toggle,
      setBpm,
      nudge,
      setTimeSig,
      setRamp,
      setSubdiv,
      cycleAccent,
      setSound,
      setVolume,
    }),
    [
      running, bpm, store.metroBpm, store.metroTimeSig, sig, ramp, subdiv, accents, sound, volume,
      start, stop, toggle, setBpm, nudge, setTimeSig, setRamp, setSubdiv, cycleAccent, setSound, setVolume,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMetronome(): Metronome {
  const value = useContext(Ctx);
  if (!value) throw new Error('useMetronome must be used inside MetronomeProvider');
  return value;
}
