# Changes — 2026-08-19 (handoff)

Branch: `master` · remote `origin` = https://github.com/benstreich/etude · commits through `4c0c9f9` are **pushed**; this handoff commit is local until Ben pushes.
Prior handoff: [2026-08-18-session-notes.md](./2026-08-18-session-notes.md)

## TL;DR

- In-app **audio recording** shipped end-to-end: record during practice (48kHz/256kbps AAC), waveform, play/pause, rename, star, delete, background recording (dev build).
- **Repertoire stages are user-defined** (add/rename/remove); pieces store a stage index. State moved to **SQLite** (`expo-sqlite/kv-store`) with AsyncStorage migration.
- Repertoire add flow consolidated into one **+ sheet** (song search + technique presets); Profile tab renamed **Settings**; assorted tab-bar/keyboard fixes.
- GitHub issues: #1 fixed (keyboard covered add sheet), #3 fixed with caveats (background recording needs a dev build).

## What shipped (commits `dafebc7`, `169a66c`, `4c0c9f9`)

| Area | Files | What |
|---|---|---|
| Recording | `src/app/practice.tsx`, `src/components/recordings.tsx` (new), `src/lib/store.tsx`, `app.json` | Record button on running session; mic-metering waveform (~60 bars, 0..1); pause/resume excludes paused time from duration+wave; `RecordingsList` shared by Repertoire ⋯ sheet and a Progress "Recordings" card; star floats to top; inline tap-to-rename; delete removes the file (`expo-file-system` `File`); `enableBackgroundRecording` + mic permission text in app.json |
| Stages | `src/lib/store.tsx`, `src/app/repertoire.tsx`, `src/app/practice.tsx`, `src/app/profile.tsx` | `settings.stages: string[]` (min 2, max 6 in editor); `Piece.stage` index replaces the old `status` union (legacy migration in load); last stage = "ready" (green, excluded from Practice picker); shrinking clamps indexes |
| Storage | `src/lib/store.tsx` | `expo-sqlite/kv-store` replaces AsyncStorage; one-time import of old AsyncStorage state on first load |
| Timer | `src/app/practice.tsx` | Wall-clock based (startedAt + banked accum) — survives backgrounding; same pattern used for recording duration |
| Repertoire UI | `src/app/repertoire.tsx` | Single + button next to title → "Add to repertoire" sheet: song search (iTunes suggestions, create-your-own, artist step) + 8 preset technique chips + custom technique input; `addTechnique`/`removeTechnique` in store; sheet capped at 60% height, scrolls, hides techniques while searching (issue #1) |
| Tabs/Settings | `src/app/_layout.tsx`, `src/components/icons.tsx`, `src/app/profile.tsx` | `animation: 'shift'`, springy `TabIcon` (reanimated), plain-Pressable tab buttons (no Android ripple); Profile → Settings with Material cog `GearIcon`; settings row values right-aligned + ellipsized |

## Owner actions / next steps

1. `git push` this handoff commit.
2. **Make an Android dev build** to actually get background recording + the system "Recording audio" notification: `npx eas build --profile development --platform android` (EAS free tier: 15 builds/mo; needs `npm i expo-dev-client` + `eas.json` — not yet set up). Expo Go can't do it.
3. Test on device (Expo Go covers everything except background recording): SDK 57 Expo Go comes from https://expo.dev/go (Play Store is stuck on SDK 54).
4. Product direction decided this session: **one-time pricing, no subscription, on-device only (no backend)**. Competitive notes: Andante $3.99 one-time is the benchmark; Modacity ~$119/yr; recordings/metronome are the "pro" features that justify charging.

## Gotchas & notes

- Waveforms come from live mic metering — recordings made before `dafebc7` have none and can't get one retroactively.
- Recording stops in Expo Go when backgrounded (dev-build only feature); in-app pause/resume works everywhere.
- Notification has the OS **stop** control only; pause/resume in the notification would need a custom native foreground service.
- Piece ↔ session/recording matching is still **by title string**; renaming a piece orphans history and recordings lists.
- `docs/` and this handoff are committed; `.playwright-mcp/` and `tabbar-check.png` are gitignored.
- iPhone testing of dev builds requires Apple Developer ($99/yr); Android is free (local `expo run:android` or EAS).

## How to verify

```
npx tsc --noEmit                 # should be silent
npx expo start -c                # then scan QR in SDK 57 Expo Go
```

App checks: Practice → start session → Record → Pause/Resume → End & save → recording appears in Progress card and the piece's ⋯ sheet (waveform shows while playing). Repertoire + → add song via search, toggle technique chips. Settings → "Repertoire stages" → add a 4th stage, rename, remove.

## Resuming in a fresh session

Read this file first; everything above is the full context. The repo state is `master` @ this commit, clean tree.
