# Changes — 2026-09-13 (handoff) — Tuner

Branch: `main` · remote `origin` = https://github.com/benstreich/etude · **nothing from this
session is pushed** — `origin/main` is still at `9fc60d1`, local `main` is ~12 commits ahead.
Prior handoff: [2026-08-19-session-notes.md](./2026-08-19-session-notes.md)

Design spec: [superpowers/specs/2026-09-13-tuner-design.md](./superpowers/specs/2026-09-13-tuner-design.md)
Implementation plan: [superpowers/plans/2026-09-13-tuner.md](./superpowers/plans/2026-09-13-tuner.md)

## TL;DR

- **Chromatic tuner shipped end-to-end**: animated arc gauge, live note + cents readout,
  instrument presets with per-string targets, adjustable reference A (415–445 Hz).
- Needed a **new local Expo module** (`modules/pitch-input`) because `expo-audio@57` exposes raw
  PCM only on `AudioPlayer`, never on `AudioRecorder`. **A fresh dev build is mandatory.**
- Pitch detection (YIN) lives in **pure TypeScript**, not native, so `scripts/check-tuner.ts`
  exercises the whole algorithm on Windows with synthesized waveforms. Accuracy is within
  **0.3 cents** from 41 Hz to 880 Hz.
- Verified on an Android emulator: builds, runs, the bridge delivers real frames, the mic is
  released on blur. **Live pitch tracking is still unverified** — emulator mics deliver silence.

## Tuner commits

`9a69258` (maths) · `d02cc19` (native module) · `a49ce30` (settings/strings/bridge) ·
`92ada57` (screen) · `21c381c` (device-found fixes) · `945cc13` + `3a1dd5e` (spec, plan)

Interleaved on the same branch but **not part of this work**: `4115a70`, `0ec0026`, `1ff1c84`
(issues #46–#50, someone else's parallel bug sweep).

## What shipped

| Area | Files | What |
|---|---|---|
| Native mic tap | `modules/pitch-input/**` (new) | Kotlin `AudioRecord` (`VOICE_RECOGNITION`, 44.1 kHz mono 16-bit, dedicated `HandlerThread`) and Swift `AVAudioEngine` input tap. Each keeps a 4096-frame ring and exposes `start()` / `stop()` / `read(): Uint8Array` / `sampleRate` / `isRecording`. **No DSP in native code.** Web stub throws `unsupported`; exported via `requireOptionalNativeModule` so Expo Go degrades to a card instead of crashing |
| Pitch maths | `src/lib/tuner-math.ts` (new) | YIN with decimate-by-4 and parabolic interpolation; `toNote` / `midiToHz` (equal temperament, sharps only); `INSTRUMENTS` table (chromatic, guitar, bass, violin, viola, cello, ukulele); `nearestString`; median `smooth`; `bytesToSamples` |
| Bridge | `src/lib/tuner-input.ts` (new) | Permissions via `expo-audio`'s `requestRecordingPermissionsAsync`, lifecycle, and `TunerStatus` (`ok` / `no-module` / `denied` / `error`) |
| Screen | `src/app/tuner.tsx` (new) | Arc gauge whose active band shrinks toward centre as the note comes in, colour ramping `tertiary → accent → success`; spring needle; lock bloom + note scale; string dot row with tap-to-pin; instrument cycler and reference-A stepper; status cards for every failure mode |
| Wiring | `src/app/_layout.tsx`, `src/app/practice.tsx`, `src/lib/store.tsx`, `src/locales/{en,de}.json` | `Tabs.Screen name="tuner" href={null}` (otherwise it becomes a sixth tab); Tuner + Metronome pills on their own row under the Practice heading; `tunerInstrument` / `tunerRefA` settings keys; full en/de strings |
| Test | `scripts/check-tuner.ts` (new), `package.json` | Wired into `npm run check`. Asserts note conversion, every instrument's open strings, sub-2-cent accuracy across the range, harmonic rejection, noise/silence rejection, median smoothing, and the PCM byte layout |

## Owner actions / next steps

1. **Test on a real device with a real instrument.** This is the one thing that could not be
   verified here. Plug in a phone, `npm run android`, open Practice → Tuner, play a known pitch
   (an A, ideally against another tuner). Confirm: correct note, needle settles instead of
   jittering, one haptic on coming into tune, bass low E (41 Hz) detected at all.
2. `git push` — 12 commits are sitting local, including other people's #46–#50 work.
3. Bump `versionCode` in `app.json` before the next EAS build — still behind what EAS used
   (see [2026-09-13-play-store-deploy.md](./2026-09-13-play-store-deploy.md)).
4. iOS whenever the Apple account happens: the Swift tap is written but has never run.

## Gotchas & notes

- **The tuner needs a fresh dev build.** New native code — an existing dev build won't have it,
  and Expo Go never will. It shows a "needs a development build" card rather than crashing.
- **`WINDOW = 4096` appears in three files and must stay in sync**: `src/lib/tuner-math.ts`,
  `PitchInputModule.kt`, `PitchInputModule.swift`. It is sized so two periods of bass low E
  (41.2 Hz, a 1070-sample period) fit in one window. Shrink it and bass breaks first.
- **Why polling, not events.** Expo Modules documents exactly one typed-array convertible:
  `Uint8Array` ↔ `Data` / `ByteArray`. `Float32Array` is undocumented and event payloads are
  plain maps, so JS pulls a synchronous `read()` every 40 ms. The byte layout (little-endian
  Int16, oldest first) is a contract between Kotlin, Swift and JS — `check-tuner.ts` asserts it.
- **Two YIN bugs worth remembering.** (1) The parabolic vertex is `lag + (c - a) / (2(2b - a - c))`.
  Writing `(a - c)` reverses the correction and produces errors that *look* plausible — 5 to 125
  cents, worst up high — rather than obviously broken. (2) Interpolate on the raw difference
  function, not the cumulative-normalized one: CMND divides by a running mean that grows with
  lag, which tilts the parabola. `cmnd` picks *which* dip; `diff` measures it.
- **`DECIMATION = 4`** is what makes YIN affordable on Hermes (~290K ops per analysis instead of
  ~2.3M). If high notes ever drift on real input, set it to `2` — the 659 Hz and 880 Hz
  assertions exist to tell you. Nothing else changes.
- **Emulator mics deliver silence.** Measured RMS 0.00013, below the `MIN_RMS` 0.005 gate, which
  is why it correctly sits on "Play a note". Feeding it a host tone did not route through.
- Running it on the device caught four defects that reading the diff never would have: the
  unregistered route adding a sixth tab, a duplicated "Play a note", an em-dash placeholder that
  read as a stray line at 92pt, and the Practice heading wrapping to four lines.
- Screenshots from this session are in `var/screenshots/` (gitignored).

## How to verify

```bash
npm run check        # 11 suites incl. check:tuner — all should print ok
npx tsc --noEmit     # silent
npm run lint         # 1 pre-existing warning in src/lib/reminders.ts, 0 errors
npm run android      # REQUIRED: new native code, old dev builds won't have it
```

Then in the app: Practice → **Tuner**. Expect the permission prompt on first open, the arc gauge
idling at centre on "Play a note", and the green mic indicator in the status bar — which must
disappear when you navigate away.

## Resuming in a fresh session

Point the next session at this file. The spec and plan linked at the top carry the full
reasoning; the two YIN bugs above are the only non-obvious parts of the maths. The open work is
item 1 under *Owner actions*: real device, real instrument.
