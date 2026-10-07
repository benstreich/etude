// Recording a take, wherever the player happens to be: the practice screen owns
// one of these, and so does a piece page. Lifted out of app/practice.tsx
// unchanged — the foreground-service dance and the audio-mode flags are the
// fiddly part and there should only ever be one copy of them.
import {
  RecordingPresets,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { LEVEL_FLOOR, SAMPLE_MS } from '@/components/motifs';
import { applyAudioMode, setRecordingFlags } from '@/lib/audio-mode';
import { detectSilence } from '@/lib/silence-math';
import { toStoredUri, useStore } from '@/lib/store';
import { downsample } from '@/lib/wave-math';

// Which hook instance holds the live take. The practice screen and a piece page
// each own a recorder, and ending the second one tears down the audio mode under
// the first (iOS stops it outright) — so only one may record at a time.
let liveOwner: symbol | null = null;

/**
 * @param pieceName what the finished take is filed under, read at stop time so
 *   the caller can change focus mid-recording. Returning null discards the take.
 */
export function useTakeRecorder(pieceName: () => string | null) {
  const store = useStore();
  const owner = useRef(Symbol('take'));
  const release = () => {
    if (liveOwner === owner.current) liveOwner = null;
  };
  const jsStop = useRef(false); // a JS-initiated stop; mutes the status listener below
  const finishRef = useRef<() => void>(() => {});
  const nameRef = useRef(pieceName);
  useEffect(() => {
    nameRef.current = pieceName;
  });

  // directory: 'document' so recordings survive cache cleanup; 48kHz/256kbps AAC (~2MB/min)
  // The status listener catches stops we didn't ask for — the foreground-service
  // notification's Stop button, an interruption, a recorder error — and finalizes
  // instead of letting the UI keep "recording" a recorder that's already dead.
  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      sampleRate: 48000,
      bitRate: 256000,
      isMeteringEnabled: true,
      directory: 'document',
    },
    (st) => {
      if (st.isFinished && !jsStop.current) finishRef.current();
    }
  );
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const recStart = useRef(0); // start of the current un-paused segment
  const recAccumMs = useRef(0); // recorded ms banked across pauses
  const waveRef = useRef<number[]>([]);

  // dBFS -50..0 → 0..1. LiveWaveform owns the polling and hands each sample back
  // through onSample, which is what builds the saved waveform — metering is a
  // destructive read on Android, so it can only have one reader (see motifs.tsx).
  // The same poll notices a recorder the OS paused behind our back — a phone call,
  // Siri, an alarm: iOS pauses the AVAudioRecorder on interruption and resumes
  // players only, never recorders, so the take would otherwise end at the call
  // while the UI kept saying "Recording". record() on a paused recorder resumes
  // it; while the interruption lasts the call simply fails and is retried next tick.
  const pausedRef = useRef(false);
  const micLevel = useCallback(() => {
    const st = recorder.getStatus();
    if (!pausedRef.current && !st.isRecording && st.canRecord) {
      try {
        recorder.record();
      } catch {}
    }
    return Math.min(1, Math.max(LEVEL_FLOOR, ((st.metering ?? -50) + 50) / 50));
  }, [recorder]);
  const onSample = useCallback((v: number) => {
    waveRef.current.push(v);
  }, []);

  const pauseResume = () => {
    if (paused) {
      recorder.record();
      recStart.current = Date.now();
    } else {
      recorder.pause();
      recAccumMs.current += Date.now() - recStart.current;
    }
    pausedRef.current = !paused;
    setPaused((p) => !p);
  };

  // shared finalize; stopNative=false when the recorder already stopped on its own
  // and there is nothing left to stop — just bank what was recorded so far
  const end = async (stopNative: boolean) => {
    const wallMs = recAccumMs.current + (paused ? 0 : Date.now() - recStart.current);
    // the recorder's own count of recorded audio, read before stop: it excludes
    // time an interruption kept the mic closed, which the wall clock cannot know.
    // Trusted only when it falls clearly short (an interruption is seconds to
    // minutes); the encoder's own lag runs a fraction of a second behind the
    // clock on every take and must not shorten them.
    let nativeMs = 0;
    try {
      nativeMs = recorder.getStatus().durationMillis || 0;
    } catch {}
    const interrupted = nativeMs > 0 && wallMs - nativeMs > 2000;
    const totalMs = interrupted ? nativeMs : wallMs;
    release();
    pausedRef.current = false;
    setRecording(false);
    setPaused(false);
    setRecordingFlags({});
    if (stopNative) {
      jsStop.current = true;
      try {
        await recorder.stop();
      } catch {}
      jsStop.current = false;
    }
    // leave record mode — Android otherwise stays in communication routing, which
    // mutes Bluetooth A2DP and plays the metronome at call volume
    applyAudioMode({ playsInSilentMode: true });
    const raw = waveRef.current;
    waveRef.current = [];
    // totalMs banks only un-paused time, which is the span `raw` should cover, so
    // one number both maps sample indices to seconds and lands as the take's length.
    // Tenths, not whole seconds: playback stops at `sec`, so rounding cut the tail.
    const sec = Math.round(totalMs / 100) / 10;
    // ...but the samples come from a JS interval, which stops while the app is in
    // the background or the screen is locked. A take played mostly with the phone
    // locked has a few seconds of samples for minutes of audio, and spreading them
    // evenly put the auto-trim bounds (and the drawn wave) nowhere near the music.
    // Too few samples for the length: save no wave and no trim rather than wrong ones.
    // Same when the recorder lost time to an interruption: the samples then span
    // more wall time than the audio does, and no longer map onto it.
    const covered = raw.length >= (0.8 * wallMs) / SAMPLE_MS && !interrupted;
    const piece = nameRef.current();
    // No focus at stop time — the piece was deleted, or the screen was left with a
    // take still running. Dropping it here lost the audio *and* leaked the file:
    // nothing in the store referenced it, so nothing could ever delete it. File it
    // under a name no piece carries instead; Repertoire lists takes whose piece is
    // missing and can re-home them onto a real one.
    if (recorder.uri)
      store.addRecording(
        piece ?? store.t('recordings.unfiled'),
        toStoredUri(recorder.uri),
        sec,
        covered ? downsample(raw) : undefined,
        undefined,
        // the lead-in and tail nearly every take has: set as playback bounds, never
        // written to the file, and re-draggable in the trim sheet like any other trim
        (covered && detectSilence(raw, sec)) || undefined
      );
  };

  useEffect(() => {
    finishRef.current = () => {
      if (recording) end(false);
    };
  });

  // Backstop: unmounted mid-take, end() never runs (the recorder is already released,
  // so the take can't be banked) — but the record-mode flags must still go, or Android
  // stays in communication routing for the rest of the session (see end).
  const recordingRef = useRef(false);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  useEffect(
    () => () => {
      if (!recordingRef.current) return;
      release();
      setRecordingFlags({});
      applyAudioMode({ playsInSilentMode: true });
    },
    []
  );

  // `recording` only turns true several awaits into a start, so a quick second
  // tap would prepare the recorder again — and its failure would tear down the
  // audio mode under the take the first tap is already recording
  const starting = useRef(false);
  const toggle = async () => {
    if (recording) return end(true);
    if (starting.current) return;
    starting.current = true;
    try {
      await start();
    } finally {
      starting.current = false;
    }
  };
  const start = async () => {
    // another screen's take is still running — see liveOwner
    if (liveOwner && liveOwner !== owner.current) return store.showToast(store.t('practice.takeAlreadyRunning'));
    const { granted, canAskAgain } = await requestRecordingPermissionsAsync();
    if (!granted) {
      // the OS won't ask again (iOS always, Android after two refusals): a toast
      // on every tap is a dead end — say where the switch is, as the tuner does
      if (!canAskAgain && Platform.OS !== 'web')
        return Alert.alert(store.t('practice.micPermissionNeeded'), store.t('practice.micBlockedBody'), [
          { text: store.t('settings.cancel'), style: 'cancel' },
          { text: store.t('tuner.openSettings'), onPress: () => Linking.openSettings() },
        ]);
      return store.showToast(store.t('practice.micPermissionNeeded'));
    }
    liveOwner = owner.current;
    try {
      // Android 13+: background recording runs a foreground service, which needs
      // notification permission or prepare throws. Denied → record foreground-only.
      // Expo Go's manifest lacks the service entirely (start silently fails and the
      // recorder dies), so background recording needs a dev build.
      const isExpoGo = Constants.appOwnership === 'expo';
      const canBackground =
        Platform.OS !== 'android' || (!isExpoGo && (await requestNotificationPermissionsAsync()).granted);
      // allowsBackgroundRecording keeps the mic running when the app is backgrounded;
      // the flags are registered so metronome/playback audio-mode calls can't clobber them
      setRecordingFlags({ allowsRecording: true, allowsBackgroundRecording: canBackground });
      await applyAudioMode({
        playsInSilentMode: true,
        shouldPlayInBackground: true, // don't cut off a metronome already running in the background
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      release();
      setRecordingFlags({});
      applyAudioMode({ playsInSilentMode: true }); // undo record-mode routing (see end)
      return store.showToast(store.t('practice.recordStartFailed'));
    }
    recStart.current = Date.now();
    recAccumMs.current = 0;
    pausedRef.current = false;
    setRecording(true);
  };

  /** Stop and throw the take away — document-dir files the store never references leak forever. */
  const discard = () => {
    // the ref, not the state: a confirm dialog holds this closure, and a take the
    // notification's Stop banked meanwhile must not have its (now stored) file deleted
    if (!recordingRef.current) return;
    recordingRef.current = false;
    release();
    pausedRef.current = false;
    setRecording(false);
    setPaused(false);
    setRecordingFlags({});
    applyAudioMode({ playsInSilentMode: true }); // undo record-mode routing (see end)
    jsStop.current = true;
    recorder
      .stop()
      .then(() => {
        try {
          if (recorder.uri) new File(recorder.uri).delete();
        } catch {}
      })
      .catch(() => {})
      .finally(() => {
        jsStop.current = false;
      });
    waveRef.current = [];
  };

  return { recording, paused, micLevel, onSample, toggle, pauseResume, discard };
}
