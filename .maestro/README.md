# End-to-end flows

Three flows, one per thing that breaks silently: a session that does not persist,
a routine that does not log, a reminder that is never scheduled. Everything below
the UI is already covered by `npm run check` — these exist for the wiring.

| Flow | Covers |
|---|---|
| `log-session.yaml` | quick log arithmetic, goal line, AsyncStorage round-trip across a restart |
| `run-routine.yaml` | plan editor → store, run state across screens, per-segment logging, review sheet |
| `set-reminder.yaml` | reminder persistence and turning it back off |

`common/fresh-start.yaml` is a subflow: clear state, grant notifications, tap
through onboarding's welcome screen and skip the rest. Every flow starts with
it, so none of them depend on the one before.

All three pass against a release build on a Pixel_10a emulator (Maestro 2.10.0).

## Running them

Maestro needs a real build — **not Expo Go**, which runs the app inside its own
container under a different app id.

```sh
# once
curl -fsSL https://get.maestro.mobile.dev | bash

# a build Maestro can install (.apk / simulator .app)
eas build --profile e2e-test --platform android --local

# with an emulator or simulator running, and the build installed
npm run e2e                       # all three
maestro test .maestro/log-session.yaml
maestro studio                    # inspect the hierarchy when a selector misses
```

## Gotchas found the hard way

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
