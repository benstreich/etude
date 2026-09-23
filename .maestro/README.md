# End-to-end flows

One flow per thing that breaks silently: a session that does not persist, a
routine that does not log, a reminder that is never scheduled, a setting that
resets. Everything below the UI is already covered by `npm run check` — these
exist for the wiring.

| Flow | Covers |
|---|---|
| `log-session.yaml` | quick log arithmetic, goal line, store round-trip across a restart |
| `run-routine.yaml` | plan editor → store, run state across screens, per-segment logging, review sheet |
| `set-reminder.yaml` | reminder persistence and turning it back off |
| `onboarding.yaml` | the real (non-skipped) onboarding path; its one atomic store write, read back |
| `practice-session.yaml` | the timer: start, surviving an app restart mid-session, pause, end & save, review commit — and discard leaving no trace |
| `repertoire-piece.yaml` | manual piece creation (offline), stage change, tempo log, all after a relaunch |
| `edit-session.yaml` | editing minutes moves the day's totals; deleting zeroes them |
| `log-past.yaml` | calendar logging onto yesterday (date computed in `scripts/yesterday.js`) |
| `metronome.yaml` | BPM steps, start/stop, tempo persistence |
| `drone.yaml` | note → frequency wiring, play/stop |
| `tuner.yaml` | the native pitch module loads, mic session opens, instrument choice persists |
| `appearance.yaml` | theme + sounds persistence, read off the Settings row |
| `progress-sections.yaml` | a layout switch turns a Home section off, and it stays off |
| `score-view.yaml` | the full score opens and pages; the staff legend opens |
| `trim-silence.yaml` | a recorded take saves and reaches the trim sheet with the Trim silence action (the maths is `check:silence`; see the flow header) |
| `tempo-ladder.yaml` | ladder config persisted on the piece, the in-session tally, and the advance reaching both the metronome and the tempo log |
| `spots.yaml` | a trouble spot added on the piece page, offered as a chip in a running session, and its minutes on the stats line afterwards (the maths is `check:spot`) |
| `spot-repetition.yaml` | a fresh trouble spot is due at once: the Repertoire badge, the "Due today" group in the Practice picker, the grade chips in the review, and the badge gone after *Easy* reschedules it (the maths is `check:repetition`) |
| `xml-import.yaml` | the bundled example MusicXML imports from the piece page (the OS picker cannot be driven), the card's row opens the engraved viewer, the score survives leaving the page, and *Remove score* brings the import chips back (the parser is `check:musicxml`, the layout `check:score-render`) |
| `suggested-session.yaml` | history seeded via log-past (`scripts/stale-days.js`) makes the Practice picker suggest a session; Start reaches the runner, leaving it shows the RunPill and hides the card, the pill returns to the run, End commits through the review (the composer is `check:suggest`; dismiss is not driven — see the flow header) |

`common/fresh-start.yaml` is a subflow: clear state, grant notifications and
the microphone, tap through onboarding's welcome screen and skip the rest.
Every flow starts with it (except `onboarding.yaml`, which owns onboarding),
so none of them depend on the one before.

All pass against a release build on a Pixel_10a emulator (Maestro 2.10.0).

## Running them

Maestro needs a real build — **not Expo Go**, which runs the app inside its own
container under a different app id.

```sh
# once
curl -fsSL https://get.maestro.mobile.dev | bash

# a build Maestro can install (.apk / simulator .app)
eas build --profile e2e-test --platform android --local

# with an emulator or simulator running, and the build installed
npm run e2e                       # the whole suite, one maestro process
npm run e2e:retry                 # one flow at a time, each retried once — see below
maestro test .maestro/log-session.yaml
maestro studio                    # inspect the hierarchy when a selector misses
```

On Windows the emulator's adb link can drop mid-suite under sustained load
("device offline" and every later flow failing in milliseconds). `e2e:retry`
absorbs that: flows run one per maestro invocation and a failed flow gets one
more try before it counts. A flow that fails twice is a real failure.

## Gotchas found the hard way

- **A local gradle release build silently runs the published OTA bundle**, not
  your code: the embedded manifest keeps a stale `commitTime`, so expo-updates
  prefers the downloaded update. Building with `./gradlew assembleRelease`
  instead of the eas profile? Set `expo.modules.updates.ENABLED` to `false` in
  `android/app/src/main/AndroidManifest.xml` first, and revert it after.
  Confirm with `adb logcat -d | grep dev.expo.updates` — it must log
  "explicitly disabled". (EAS `e2e-test` builds are not affected.)

- **Scroll before every tap below the fold.** The quick-log chips move when a
  session row appears above them, so even the second chip in the same row needs
  its own `scrollUntilVisible`.
- **Scroll to the assertion, not just near it.** "Goal met" sits in the card
  header *above* the minutes counter; scrolling to the counter stops one row short.
- **A settings row's value is a child node.** The `testID` is on the pressable
  row, the label and value are `Text` children, so the value needs `childOf`.
- **A cold emulator throws a "System UI isn't responding" dialog** that covers
  the hierarchy and fails every selector. Dismiss it and give the emulator a
  minute before blaming a flow.

## Selectors

Taps go through `testID` (`id:` in the YAML), not visible text: the app ships
English and German, and Maestro matches text as a regex, so a localised or
punctuated label is two ways to break. Assertions still use text where the text
*is* the thing under test — "Goal met", "Segment 1 of 2".

**The flows assume an English device locale** for those assertions. On a German
emulator they will fail on the assertion, not the tap.

Adding a flow: give the element a `testID`, keep the name kebab-cased and
scoped to the screen (`plan-start`, `setting-reminder`), and reach it with
`scrollUntilVisible` rather than a bare `swipe`.
