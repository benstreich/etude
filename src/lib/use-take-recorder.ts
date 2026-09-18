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
import { Platform } from 'react-native';

import { LEVEL_FLOOR } from '@/components/motifs';
import { applyAudioMode, setRecordingFlags } from '@/lib/audio-mode';
import { toStoredUri, useStore } from '@/lib/store';
import { downsample } from '@/lib/wave-math';

/**
 * @param pieceName what the finished take is filed under, read at stop time so
 *   the caller can change focus mid-recording. Returning null discards the take.
 */
export function useTakeRecorder(pieceName: () => string | null) {
  const store = useStore();
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
  const micLevel = useCallback(
    () => Math.min(1, Math.max(LEVEL_FLOOR, ((recorder.getStatus().metering ?? -50) + 50) / 50)),
    [recorder]
  );
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
    setPaused((p) => !p);
  };

  // shared finalize; stopNative=false when the recorder already stopped on its own
  // and there is nothing left to stop — just bank what was recorded so far
  const end = async (stopNative: boolean) => {
    const totalMs = recAccumMs.current + (paused ? 0 : Date.now() - recStart.current);
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
    const piece = nameRef.current();
    if (recorder.uri && piece)
      store.addRecording(piece, toStoredUri(recorder.uri), Math.round(totalMs / 1000), downsample(raw));
  };

  useEffect(() => {
    finishRef.current = () => {
      if (recording) end(false);
    };
  });

  const toggle = async () => {
    if (recording) return end(true);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return store.showToast(store.t('practice.micPermissionNeeded'));
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
      setRecordingFlags({});
      applyAudioMode({ playsInSilentMode: true }); // undo record-mode routing (see end)
      return store.showToast(store.t('practice.recordStartFailed'));
    }
    recStart.current = Date.now();
    recAccumMs.current = 0;
    setRecording(true);
  };

  /** Stop and throw the take away — document-dir files the store never references leak forever. */
  const discard = () => {
    if (!recording) return;
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
