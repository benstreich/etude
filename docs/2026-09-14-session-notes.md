# Changes — 2026-09-14 (handoff) — Etude on a phone, over-the-air updates, one font

Branch: `main` · remote `origin` = https://github.com/benstreich/etude · **nothing from this
session is pushed** — `origin/main` is still at `9fc60d1`, local `main` is 16 commits ahead.
Prior handoff: [2026-09-13-session-notes.md](./2026-09-13-session-notes.md)

Related: [2026-09-13-play-store-deploy.md](./2026-09-13-play-store-deploy.md)

## TL;DR

- **Etude runs on a real Android phone.** Three EAS builds were made; only the third matters,
  because it is the only one with the over-the-air updater baked in.
- **EAS Update is set up and verified end to end.** JavaScript changes now reach the phone in
  about a minute with `eas update`, no rebuild, no cable, no laptop on the same wifi.
- **Settings shows which bundle is running** (`Etude 1.0.0 · <update id>`), because the app
  version never moves across over-the-air updates and so cannot answer that question alone.
- **Space Grotesk is now the whole app.** The design tokens had headings on Space Grotesk and
  body text on Instrument Sans; the split was visible and deliberate, and the owner chose one face.

## Commits

`6f62fb2` (sound-file rename, dev-client) · `0e9598b` (EAS Update setup) · `744c862` (version
line in Settings) · `d6887ff` (Space Grotesk everywhere)

The first two are ancestors of `9fc60d1` and are **already on `origin`**. The last two are not.

Interleaved on the same branch but **not part of this work**: the entire tuner feature and the
issues #46–#50 sweep — see the prior handoff.

## The three APKs, and why only one of them is useful

They all install under the same package id, `com.benstreich.etude`, so each one replaces the
last and there is no way to tell them apart from the home screen. This caused real confusion
during the session.

| Build | Profile | Can receive updates? | Use it? |
|---|---|---|---|
| `bace8177` | preview | **No** — built before `expo-updates` existed | No |
| `a8542407` | development | No — needs `expo start --dev-client` and a laptop on the same wifi | Only for live reload |
| `80ac264a` | preview | **Yes** | **This one** |

Install link for the one that matters:
`https://expo.dev/artifacts/eas/iyKBmnS5mmdS4iJzRxT72P62reQiwP8Vac_FHwCA18M.apk`

**How to tell which one is on the phone:** scroll to the bottom of Settings. An eight-character
code means updates are landing. The word `bundled` means it is running the JavaScript baked into
the APK and has not fetched an update yet. No line at all means it is one of the first two builds.

## What shipped

| Area | Files | What |
|---|---|---|
| Android prebuild fix | `assets/audio/cue_reminder.wav` (renamed), `app.json`, `src/lib/reminders.ts` | The notification sound was named with a hyphen. Android resource names allow only lowercase letters, digits and underscores, so the `expo-notifications` config plugin rejected it and **prebuild failed on EAS**. Renamed with an underscore |
| Live-reload loop | `package.json`, `eas.json` | `expo-dev-client` plus a `development` build profile |
| Over-the-air updates | `package.json`, `app.json`, `eas.json` | `expo-updates`, the update URL, an `appVersion` runtime-version policy, and a channel per build profile. The config writer duplicated the Android permissions and the iOS app group while editing `app.json`; both were deduped in the same commit |
| Version readout | `src/app/profile.tsx` | One line at the foot of Settings: app version plus the running update id, `bundled` on the embedded bundle, `dev` when served from Metro |
| Global font default | `src/components/text.tsx` (new), 23 files | A `Text` wrapper applying the design system's body face. RN 0.86 exports `Text` as a plain function component and React 19 ignores `defaultProps` on those, so a wrapper is the only supported route. Explicit styles come after the default and still win |
| One face everywhere | `src/lib/theme.ts`, `src/app/_layout.tsx`, `package.json` | The `body` / `bodyMed` / `bodySemi` tokens now resolve to Space Grotesk 400/500/600. Added the 400 weight to the loaded set; dropped the unused `@expo-google-fonts/instrument-sans` |

## Owner actions / next steps

1. **Confirm the font actually landed on the phone.** Bottom of Settings, check the code changes
   after an `eas update`. If the line is missing, reinstall the `80ac264a` APK.
2. `git push` — 16 commits sitting local, most of them the tuner work, not this session's.
3. **Decide the runtime-version policy before the next release** — see the landmine below. This
   is the one item here with real consequences.
4. Bump `versionCode` in `app.json` before the next EAS build. It is at 3 locally and still
   behind what EAS has used. Unchanged from the prior handoff.
5. Eight Newsreader-italic usages remain (tempo terms, the "of N min" counters, the note
   placeholder). Space Grotesk ships no italic, so they were left alone deliberately.

## Gotchas & notes

- **The runtime-version landmine.** The policy is `appVersion`, pinned to `1.0.0`. That string
  only moves when someone edits it by hand, so **adding native code does not invalidate old
  builds**. The tuner landed after the `80ac264a` build: publishing an update now ships tuner
  JavaScript to an APK that has no `pitch-input` module inside it. It degrades safely today, only
  because the tuner screen uses `requireOptionalNativeModule` and shows a "needs a development
  build" card — that is luck in the shape of good defensive code, not a guarantee. A
  `fingerprint` policy would compute the runtime version from the native dependency graph and
  refuse the mismatch outright. Worth switching before anyone else installs this.
- **Over-the-air updates carry JavaScript and assets only.** New native packages, config-plugin
  changes, permission changes, icons and the splash screen all still need a full rebuild.
- **Updates apply on the launch after the one that fetched them.** The updater downloads in the
  background, so the first reopen usually still shows the old bundle and the second shows the new
  one. This looks exactly like a broken update. It is not.
- **`eas update` needs `--environment` in non-interactive mode**, or it exits with an error that
  does not name the flag clearly. Full command:
  `npx eas update --branch preview --environment preview -m "..."`.
- **Mixed fonts were the design, not a bug.** Space Grotesk carried 40 usages (screen titles,
  greetings, timers, big numerals) against 212 on Instrument Sans. The owner chose a single face
  after seeing the split on a device.
- **A mistake worth not repeating.** `$TMPDIR` is empty in this Git Bash environment, and
  `cd ""` succeeds silently as a no-op. A screenshot script and an `npm install` therefore ran
  **inside the repo** instead of the scratchpad, which added a `playwright` dependency, injected
  `npm init` junk fields into `package.json`, and dropped three `.mjs` files in the project root.
  All reverted. Use an absolute scratch path, never `$TMPDIR`.
- **Web screenshots are a workable review loop on Windows.** `npx expo start --web` plus a small
  Playwright script renders the real screens. First bundle takes over two minutes, so `networkidle`
  times out — wait on `load` instead. The Playwright MCP server holds a browser-profile lock and
  will refuse a second instance; a standalone script sidesteps it.
- Screenshots from this session live in the session scratchpad and are **not** in the repo.

## How to verify

```bash
npm run check        # all suites should print ok
npx tsc --noEmit     # silent
npm run lint         # 1 pre-existing warning in src/lib/reminders.ts, 0 errors
```

Font and update plumbing, on a device:

```bash
npx eas update --branch preview --environment preview -m "test"
npx eas channel:view preview     # confirms what the channel is serving
```

Then on the phone: reopen Etude twice, scroll to the bottom of Settings, and check the code
against the update id that `eas update` printed. Every screen should be in one face.

## Resuming in a fresh session

Point the next session at this file. The prior handoff carries the tuner, which is the larger
body of work on this branch. The one item here that needs a decision rather than typing is the
runtime-version policy under *Gotchas* — everything else is either done or a one-line command.
