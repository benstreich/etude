# Audio identity

Two sounds, both built on one interval: a rising perfect fourth, **D4 (293.66 Hz)
→ G4 (392 Hz)**. Nothing else in the app makes a noise — no taps, no saves, no
transitions. The metronome click is a separate thing and always wins.

Both samples are generated, not recorded:

```
python scripts/make-cues.py
```

The voice is a felt mallet — a sine fundamental plus a 4th partial at ~6% that
decays four times faster, 8 ms attack, exponential release. Peak sits around
−18 LUFS: present, not loud.

| Cue | File | Notes |
| --- | --- | --- |
| Session complete | `assets/audio/cue-session-complete.wav` | D4 at 0 s (1.6 s), G4 at 220 ms (2.1 s), G5 shimmer at 220 ms (1.1 s, 25%). Master 0.5. |
| …in three other voices | `cue-session-pluck.wav`, `cue-session-bow.wav`, `cue-session-perc.wav` | Same notes, same timing, shorter tails. Pluck: 2 ms attack, bright 2nd/3rd partials. Bow: 140 ms swell, 5 Hz vibrato, slow release. Perc: noise transient over a fast-damped low tone. |
| Reminder | `assets/audio/cue_reminder.wav` | Single D5 (587.33 Hz), 55%, 1.8 s — the fourth's answer, an octave up. |

## Which voice

The voice follows the player's **primary instrument** — the one chosen in
Settings when more than one is listed, otherwise the first. `src/lib/cue-voice.ts`
maps a name to one of four samples by keyword (first match wins, so "Bass
Clarinet" bows and "Bass Guitar" plucks); anything unmatched keeps the mallet.
`scripts/check-cue-voice.ts` asserts the overlapping names and that all 92
instruments land on a real sample.

## Where they play

- **Session complete** — `src/lib/sounds.ts`, once when the session review opens.
  Once really means once: a 3 s window in `playSessionComplete` swallows a
  repeat call, because the review effect could fire twice and double the cue (#53).
- **Reminder** — the OS plays it. Bundled by the `expo-notifications` config
  plugin (`app.json`) and referenced by base filename from
  `src/lib/reminders.ts`, on both the notification content and the Android
  channel — note the underscore: Android raw resource names may not contain
  hyphens. A channel's sound is fixed at creation, so changing it needs a fresh
  channel id or a reinstall — the toggle below only affects newly created channels.

## Rules

- The **Sounds** setting (Appearance, default on) gates both.
- Silent mode wins: the in-app cue sets `playsInSilentMode: false` and lets iOS
  mute it rather than reading the ring switch ourselves.
- Never over the metronome — `playSessionComplete` checks `metronomeRunning()`.
