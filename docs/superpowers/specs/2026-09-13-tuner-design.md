# Étude Tuner — design

Date: 2026-09-13
Status: approved, ready for implementation plan

A chromatic instrument tuner with instrument presets and per-string targets,
living on its own route and entered from Practice. Animated, colour-coded
readout built from the dependencies already in the tree.

## Why this needs native code

`expo-audio@57` exposes raw PCM **only on `AudioPlayer`**
(`setAudioSamplingEnabled` / `useAudioSampleListener`,
`node_modules/expo-audio/build/AudioModule.types.d.ts:162`). `AudioRecorder`
has no sample tap — it writes a file and reports metering, nothing more. There
is no path from the microphone to JS in the current dependency set, so the
tuner needs a new local Expo module.

This is the same situation `modules/metronome-controls` already solved for
lock-screen transport, and it reuses that scaffolding wholesale.

**Consequence:** the tuner requires a fresh dev build (`npm run android` or an
EAS dev build). It cannot run in Expo Go. Handled gracefully, not fatally —
see *Error states*.

## Architecture

Three layers, each independently understandable and testable:

```
modules/pitch-input   native mic tap        → Int16 PCM bytes, no DSP
src/lib/tuner-math.ts pure functions        → hz, note, cents, strings
src/app/tuner.tsx     screen + animation    → React, Reanimated, SVG
```

The split exists so the pitch-detection algorithm is written **once**, in
TypeScript, where `scripts/check-tuner.ts` can exercise it on Windows without
a device. The native side stays dumb enough that a bug in it is obvious.

### Layer 1 — `modules/pitch-input`

Cloned from `modules/metronome-controls`: same `expo-module.config.json`
shape, same `requireOptionalNativeModule` export so a missing native side
degrades instead of crashing.

| Member | Signature | Notes |
|---|---|---|
| `start()` | `void` | Opens the mic, begins filling a ring buffer. Idempotent. |
| `stop()` | `void` | Releases the mic. Idempotent. |
| `read()` | `Uint8Array` | The most recent **4096 frames** as little-endian Int16 PCM, mono (8192 bytes). Empty until the buffer has filled once. |
| `sampleRate` | `number` | Property. Actual device rate; 44100 requested. |
| `isRecording` | `boolean` | Property. |

**Transport rationale.** Expo Modules documents exactly one typed-array
convertible — `Uint8Array` ↔ `Data` (iOS) / `ByteArray` (Android), SDK 50+.
`Float32Array` is not documented, and event payloads are plain
`Map<String, Any?>` with no stated typed-array support. So JS **polls** a
synchronous `read()` rather than receiving pushed events. Android's
`AudioRecord` produces `ENCODING_PCM_16BIT` natively, so this is also the
conversion-free path there. At 8 KB / 25 Hz it is ~200 KB/s across the
bridge — unremarkable.

**Ring buffer.** Native keeps a 4096-frame ring and `read()` always returns
the whole window, newest-last. Not a delta: a full analysis window every call
means JS holds no audio state at all, and a slow JS frame simply analyses
slightly older audio instead of queueing a backlog.

**Why 4096.** YIN needs roughly two periods to resolve a pitch. The lowest
supported note is bass low E at 41.2 Hz — a 1070-sample period at 44.1 kHz,
so 2048 frames is not enough window and 4096 is. One size for every
instrument; no per-preset special-casing. The cost is ~93 ms of latency,
which is imperceptible against the time it takes to turn a peg.

- **Android:** `AudioRecord`, source `VOICE_RECOGNITION` (no AGC/NS colouring
  the pitch the way `VOICE_COMMUNICATION` does), 44.1 kHz, mono, 16-bit,
  read loop on a dedicated `HandlerThread`.
- **iOS:** `AVAudioEngine` input node tap, Float32 →
  Int16 conversion in the tap. Written now, **untested until an Apple
  developer account exists** — noted in the handoff, not silently shipped as
  if verified.
- **Web:** stub that throws `unsupported` on `start()`, matching
  `MetronomeControlsModule.web.ts`.

Microphone permission is already declared for both platforms
(`app.json:26` `RECORD_AUDIO`, `app.json:54` `microphonePermission`). The
runtime request reuses `expo-audio`'s `requestRecordingPermissionsAsync`
rather than adding a second permission path.

### Layer 2 — `src/lib/tuner-math.ts`

Pure functions, no React, no native imports. Mirrors the shape of
`metronome-math.ts` and `tempo.ts`.

- **`detectPitch(samples: Float32Array, sampleRate: number): { hz, clarity } | null`**

  YIN: difference function → cumulative mean normalized difference →
  absolute threshold (0.15) → parabolic interpolation of the chosen minimum.
  Returns `null` below the clarity threshold so room noise reads as silence
  instead of a wandering needle. Search restricted to **38–1000 Hz** — the
  low bound clears bass low E (41.2 Hz), the high bound clears violin E5
  (659 Hz) with headroom.

  **Decimated by 4 before analysis.** Naive YIN is O(window × lags). At
  44.1 kHz with a 38 Hz floor that is ~2.3 M multiply-accumulates per
  analysis, 25 times a second — too slow for Hermes. Averaging each group of
  4 samples (a cheap box filter, which also anti-aliases) gives an effective
  11.025 kHz: a 1024-sample window, lags 11–290, ~290 K operations per
  analysis. Same 93 ms of audio, an eighth of the work.

  Decimation costs frequency resolution at the top of the range, which
  parabolic interpolation is there to recover. This is the one assumption in
  the design that could fail quietly, so `check-tuner.ts` asserts **under 2
  cents of error at 659 Hz and 880 Hz** specifically. If those assertions
  fail, decimate by 2 instead — a one-constant change. The test decides, not
  an estimate.

- **`toNote(hz: number, refA: number): { name, octave, midi, cents }`**

  `midi = 69 + 12·log2(hz / refA)`. Cents are the signed distance to the
  nearest semitone, clamped to ±50. Sharps only (`A♯`, not `B♭`) — one
  spelling, no key context to guess from.

- **`INSTRUMENTS`** — a flat table of MIDI numbers per open string:
  `chromatic` (none), `guitar` (E2 A2 D3 G3 B3 E4), `bass` (E1 A1 D2 G2),
  `violin` (G3 D4 A4 E5), `viola` (C3 G3 D4 A4), `cello` (C2 G2 D3 A3),
  `ukulele` (G4 C4 E4 A4). No presets engine, no config file.

- **`nearestString(midi, strings): number | null`** — index of the closest
  target, or `null` beyond 3 semitones so a wild note doesn't yank the
  highlight around.

- **`smooth(history: number[]): number`** — median of the last 5 readings.
  Median, not mean: octave-error outliers get rejected outright instead of
  dragged into the average.

### Layer 3 — `src/app/tuner.tsx`

Entered from Practice beside `<MetronomeButton compact />`
(`src/app/practice.tsx:219`). The mic starts on focus and stops on blur — a
tuner holding the microphone open in the background is a one-star review.

Design language follows the existing tokens in `src/lib/theme.ts`: warm paper
palette, Space Grotesk for numerals, Newsreader italic for the musical voice.
Built with `react-native-svg` and `react-native-reanimated` — both already
dependencies. No new packages.

- **Arc gauge.** A wide arc across the top, ±50 cents. The needle is a
  Reanimated **spring** on cents, not a timing animation, so it carries
  physical weight — slight overshoot, then settle, the way an analog tuner
  behaves.
- **Colour as the primary signal.** The arc fills `C.tertiary` (far) →
  `C.accent` (close) → `C.success` (locked). Under 5 cents the arc blooms
  into a success-tinted halo and the note glyph scales ~4%: one unmistakable
  "you're there" moment. A single `Haptics.selectionAsync()` on *entering*
  lock, none on leaving, so it never buzzes while a peg is turned.
- **Note readout.** Large, centred, Newsreader italic, real ♯ glyphs, octave
  as a small superscript. Live cents value beneath in Space Grotesk.
- **String row.** When an instrument is selected, one dot per string along
  the bottom; the detected target lights and fills as that string comes into
  tune. Tapping a dot locks onto that string and ignores the rest.
- **Header row.** Instrument picker and reference A (415–445 Hz), both
  persisted through the existing store.
- **`reduceMotion`** respected throughout, matching the contract in
  `src/components/motifs.tsx`: springs become instant, the halo becomes a
  static border.

All user-facing strings go through `src/locales/en.json` and `de.json` like
every other screen.

## Data flow

```
setInterval(40ms)
  → PitchInput.read()            Uint8Array (Int16 LE PCM)
  → Int16Array view, /32768      Float32Array
  → detectPitch()                { hz, clarity } | null
  → smooth() over last 5         hz
  → toNote(hz, refA)             { name, octave, midi, cents }
  → nearestString()              target index | null
  → shared values                arc, needle, colour, halo
```

Only the final step touches React state; the needle and colour are Reanimated
shared values driven from the same tick, so the animation does not re-render
the tree at 25 Hz.

## Error states

Every one of these is a visible card with a way forward, never a dead gauge:

| Condition | Behaviour |
|---|---|
| Permission denied | Card explaining why, button opening system settings. |
| Native module absent (Expo Go) | "The tuner needs a dev build" card. Detected via `requireOptionalNativeModule` returning `null`. |
| Mic unavailable / grabbed by another app | Stop, show the reason, offer retry. |
| No sound detected | Not an error. Gauge rests at centre, dimmed, "play a note". |

## Testing

`scripts/check-tuner.ts`, wired into `npm run check` alongside the nine
existing check scripts. Assertion-based, no framework, no fixtures —
synthesized waveforms in, expected notes out:

1. 440 Hz sine → A4, 0 cents (±0.5).
2. 466.16 Hz → A♯4, ~0 cents.
3. 442 Hz → A4, ≈ +7.85 cents.
4. 220 Hz and 880 Hz → A3 and A5 (no octave errors).
5. A sawtooth at 196 Hz → G3 (harmonics must not fool YIN).
6. White noise → `null`.
7. Silence → `null`.
8. Every instrument's open strings round-trip: MIDI → Hz → `toNote` → same
   name, and `nearestString` picks that string.
9. `refA = 415` shifts A4 to 415 Hz.
10. `smooth` rejects a single octave-error outlier.

## Deliberately out of scope

Polyphonic detection, tuning history/graphs, a strobe display, alternate
temperaments, and flat spellings. Add temperaments when there is a
harpsichord to tune.

## Risks

- **iOS is written blind.** No Apple developer account yet
  (`memory: etude-product-direction`), so the Swift tap ships unverified.
  Flagged in the handoff.
- **Low-bass detection on real hardware.** 4096 frames is sufficient in
  theory for 41 Hz, but phone microphones roll off hard down there. If bass
  low E proves unreliable on device the fix is a larger window (8192), not a
  different algorithm — the ring buffer size is a single constant.
- **Decimation vs. high-note accuracy.** Decimating by 4 is what makes YIN
  affordable in JS, but it coarsens lag resolution above ~600 Hz. Guarded by
  explicit sub-2-cent assertions at 659 Hz and 880 Hz in the check script; if
  they fail, decimate by 2.
