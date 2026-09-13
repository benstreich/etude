# Session notes — 2026-09-13 — Tuner

Built the tuner end to end: spec → plan → native module → maths → screen.

- Spec: `docs/superpowers/specs/2026-09-13-tuner-design.md`
- Plan: `docs/superpowers/plans/2026-09-13-tuner.md`

## The thing you need to know first

**The tuner needs a fresh dev build.** It will not work in Expo Go, and it will
not work on an existing dev build made before today — there is new native code.
`npm run android`, or an EAS dev build.

In Expo Go the screen doesn't crash; `requireOptionalNativeModule` returns null
and it shows a "needs a development build" card.

## Why there's a new native module at all

`expo-audio@57` exposes raw PCM **only on `AudioPlayer`**
(`setAudioSamplingEnabled` / `useAudioSampleListener`). `AudioRecorder` has no
sample tap — it writes a file and reports metering. There is no microphone →
JS path in the dependency set, so `modules/pitch-input` exists to provide one.
It was cloned from `modules/metronome-controls` and follows the same shape.

The module does **no DSP**. It keeps a ring buffer and hands JS raw frames.
All the maths is in `src/lib/tuner-math.ts`, in TypeScript, once — which is why
`scripts/check-tuner.ts` can exercise the entire algorithm on Windows with
synthesized waveforms and no device attached.

## Constants that must stay in sync

`WINDOW = 4096` appears in three places and they must match:

- `src/lib/tuner-math.ts`
- `modules/pitch-input/android/.../PitchInputModule.kt`
- `modules/pitch-input/ios/PitchInputModule.swift`

4096 frames is ~93 ms at 44.1 kHz. It is sized so two periods of the lowest
supported note (bass low E, 41.2 Hz, a 1070-sample period) fit in one window.
Shrink it and bass detection breaks first.

## Transport: why polling, not events

Expo Modules documents exactly one typed-array convertible — `Uint8Array` ↔
`Data` (iOS) / `ByteArray` (Android). `Float32Array` is not documented, and
event payloads are plain maps with no stated typed-array support. So JS polls
a synchronous `read()` every 40 ms instead of receiving pushed buffers. Android
gives `ENCODING_PCM_16BIT` natively, so this is also the conversion-free path.

The byte layout (little-endian Int16, oldest first) is a contract between
Kotlin, Swift and JS. `check-tuner.ts` asserts it via `bytesToSamples`.

## Two bugs worth remembering

1. **Parabolic interpolation sign.** The YIN vertex correction is
   `lag + (c - a) / (2 * (2b - a - c))`. Getting it as `(a - c)` reverses the
   correction and produces errors that *look* plausible — 5 to 125 cents,
   worst at high notes — rather than obviously broken. The check script's
   sub-2-cent assertions are what caught it.
2. **Interpolate on the raw difference function, not on the CMND.** The
   cumulative normalization divides by a running mean that grows with lag,
   which tilts the parabola. `cmnd` still chooses *which* dip; `diff` measures
   it.

With both right, every tested pitch from 41 Hz to 880 Hz lands within
0.3 cents.

## Decimation

`DECIMATION = 4` in `tuner-math.ts`. Naive YIN at 44.1 kHz with a 38 Hz floor
is ~2.3M multiply-accumulates per analysis, 25×/sec — too slow for Hermes.
Averaging groups of 4 samples drops it to ~290K for the same 93 ms of audio.

If high notes ever drift on real input, set it to 2. That is the whole fix;
the assertions at 659 Hz and 880 Hz exist to tell you.

## Still open

- **iOS is unverified.** `PitchInputModule.swift` is written but has never run
  — no Apple developer account on this project yet. It mirrors the Kotlin
  logic and reports the hardware sample rate rather than assuming 44.1 kHz
  (iOS commonly hands back 48 kHz), but treat it as untested code.
- **Emulator microphones** are unreliable for this. Real-device testing
  against a known pitch is the only meaningful check of the Android tap.
- `versionCode` in `app.json` is still behind what EAS has used — see
  `docs/2026-09-13-play-store-deploy.md`. Unrelated to the tuner, still true.
