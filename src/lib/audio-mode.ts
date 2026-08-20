// expo-audio's setAudioModeAsync does NOT merge — every omitted flag resets to
// false natively. A playback or metronome call made mid-recording would silently
// kill the mic (Android pauses the recorder on backgrounding; iOS stops it
// outright). Route every audio-mode change through here instead.
import { setAudioModeAsync, type AudioMode } from 'expo-audio';

let recFlags: Partial<AudioMode> = {};

/** Set by the record flow while a recording is live; {} once it ends. */
export const setRecordingFlags = (flags: Partial<AudioMode>) => {
  recFlags = flags;
};

export const applyAudioMode = (mode: Partial<AudioMode>) =>
  setAudioModeAsync({ ...mode, ...recFlags }).catch(() => {});
