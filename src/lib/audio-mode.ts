// expo-audio's setAudioModeAsync does NOT merge — every omitted flag resets to
// false natively. A playback or metronome call made mid-recording would silently
// kill the mic (Android pauses the recorder on backgrounding; iOS stops it
// outright). Route every audio-mode change through here instead.
import { setAudioModeAsync, type AudioMode } from 'expo-audio';

let recFlags: Partial<AudioMode> = {};
let metroFlags: Partial<AudioMode> | null = null;

/** Set by the record flow while a recording is live; {} once it ends. */
export const setRecordingFlags = (flags: Partial<AudioMode>) => {
  recFlags = flags;
};

/**
 * Set by the metronome while it runs; null once it stops. Its background and
 * interruption flags win over any other screen's call for as long as it clicks —
 * playing a take over the click used to reset them, and iOS then dropped the
 * lock-screen controls and paused the click pool on the next background.
 */
export const setMetronomeMode = (flags: Partial<AudioMode> | null) => {
  metroFlags = flags;
};

export const applyAudioMode = (mode: Partial<AudioMode>) =>
  setAudioModeAsync({ ...mode, ...(metroFlags ?? {}), ...recFlags }).catch(() => {});
