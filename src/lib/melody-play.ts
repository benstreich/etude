// Plays the melody staff on the grand piano (lib/piano-samples.ts): each note is
// the nearest sample shifted to its pitch in the chosen key, held for its value.
// Whole note = 1.6 s (quarter at 150), an empty bar rests half that. A bar holds
// a day's sessions, so a day never runs longer than a whole note however it split.
import { createAudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { applyAudioMode } from './audio-mode';
import { thud } from './haptics';
import { midiFor, valueFor, type Bar, type MelodyKey, type MelodyNote } from './melody';
import { pianoFor } from './piano-samples';

const WHOLE_MS = 1600;
const REST_MS = 800;
const RING_MS = 2600; // how long a note keeps decaying under the notes after it

/**
 * The feel. Louder for longer notes (a whole note is a day's goal in one sitting),
 * a long crescendo through the phrase towards today, and a small wobble in
 * loudness and timing seeded from the focus, so a given piece always leans the
 * same way — human, but not random on every listen.
 */
function dynamics(n: MelodyNote, fraction: number, index: number, total: number) {
  let h = 0;
  for (let i = 0; i < n.title.length; i++) h = (h * 31 + n.title.charCodeAt(i)) | 0;
  const wobble = ((Math.abs(h) % 1000) / 1000 - 0.5) * 2; // -1..1
  const byValue = 0.5 + 0.45 * fraction; // eighth ≈ 0.56, whole ≈ 0.95
  const phrase = total > 1 ? 0.8 + 0.2 * (index / (total - 1)) : 1; // crescendo to today
  const volume = Math.min(1, Math.max(0.3, byValue * phrase + wobble * 0.06));
  const lead = Math.max(0, Math.round(15 + wobble * 25)); // 0..40 ms behind the beat
  return { volume, lead };
}
const LOAD_WAIT_MS = 3000; // how long a note may wait for its sample (first download in Expo Go) before we play it anyway

type Player = ReturnType<typeof createAudioPlayer>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves once the sample is loaded, or after LOAD_WAIT_MS — a slow Metro stream must not stall the tune. */
const untilLoaded = async (p: Player) => {
  for (let waited = 0; !p.isLoaded && waited < LOAD_WAIT_MS; waited += 50) await sleep(50);
};

/** Release a player that may already be gone (stop() races the loop). */
const release = (p: Player | null) => {
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch {
    // already removed
  }
};

/**
 * Sequenced playback of bars. `play` runs the bars in order and resolves when
 * done or stopped; `stop` cuts it. One player per note, released as it ends.
 * A run token, not a boolean, guards the loop: a restart while an older loop
 * sleeps must not let that loop resume when it wakes.
 * ponytail: setTimeout sequencing, not a sample-accurate scheduler — this is a
 * toy to hear your week, not a metronome.
 */
export function useMelodyPlayer() {
  const [playing, setPlaying] = useState<string | null>(null); // date of the bar sounding now
  const run = useRef(0); // bumps on every play/stop; a loop whose token is stale exits
  const ringing = useRef(new Set<Player>()); // notes still decaying under the next ones
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  const stop = () => {
    run.current++;
    for (const t of timers.current) clearTimeout(t);
    timers.current.clear();
    for (const p of ringing.current) release(p);
    ringing.current.clear();
    if (mounted.current) setPlaying(null);
  };
  useEffect(
    () => () => {
      mounted.current = false;
      stop(); // leaving the screen silences it
    },
    []
  );

  // a note is released only after it has had time to decay under its successors,
  // the way a pianist lets the sustain carry — cutting it at the next attack is the robot
  const letRing = (p: Player, ms: number) => {
    ringing.current.add(p);
    const t = setTimeout(() => {
      release(p);
      ringing.current.delete(p);
      timers.current.delete(t);
    }, ms + RING_MS);
    timers.current.add(t);
  };

  const play = async (bars: Bar[], goal: number, key: MelodyKey) => {
    stop();
    const mine = run.current;
    const live = () => mounted.current && run.current === mine;
    applyAudioMode({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
    const total = bars.reduce((n, b) => n + b.notes.length, 0); // notes, not bars: a bar may hold several
    let index = 0; // position in the phrase, for the long crescendo towards today
    for (const bar of bars) {
      if (!live()) return;
      setPlaying(bar.date);
      if (bar.notes.length === 0) {
        await sleep(REST_MS);
        continue;
      }
      for (const n of bar.notes) {
        if (!live()) return;
        const { source, rate } = pianoFor(midiFor(n.pitch, key));
        const v = valueFor(n.min, goal);
        const ms = v.f * WHOLE_MS;
        const { volume, lead } = dynamics(n, v.f, index++, total);
        let p: Player | null = null;
        try {
          // downloadFirst: a local file, as in the APK, instead of a Metro stream in Expo Go
          p = createAudioPlayer(source, { downloadFirst: true });
          p.shouldCorrectPitch = false;
          p.setPlaybackRate(rate);
          p.volume = volume;
          await untilLoaded(p);
          if (!live()) return release(p); // stopped during load
          if (lead > 0) await sleep(lead); // a hair late: the pianist breathing, not the grid
          if (!live()) return release(p);
          p.play();
          thud(v.f < 0.5); // feel each note land; the long ones a little harder
          letRing(p, ms);
        } catch {
          release(p); // a player that won't load is a skipped note, not a dead tune
          continue;
        }
        await sleep(Math.max(0, ms - lead));
      }
    }
    if (live()) setPlaying(null);
  };

  return { playing, play, stop };
}
