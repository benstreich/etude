# Widgets (#17, feature 6)

Widgets need a native build — they never appear in Expo Go.

## How it works

After anything that changes today's numbers, `WidgetSync` (mounted in the Shell)
pushes `{today, goal, streak, week[7], nextFocus}` through the local module
`modules/etude-widgets`:

- **Android**: written to `SharedPreferences("etude.widgets")`, then both
  `AppWidgetProvider`s repaint. The providers, layouts, and manifest receivers all
  live inside the module (library manifest merging) — `android/app` is untouched.
  Two widgets: small (goal ring + streak + minutes) and medium (minutes, streak +
  next piece, Practice deep-link pill via `etude://practice`, 7 week bars).
  Ring and bars are drawn as bitmaps (RemoteViews has no arc primitive).
  Widget colors are fixed brand terracotta with light/dark via `values-night`
  (they do not follow the in-app accent setting).
- **iOS (UNVERIFIED scaffold)**: written to the App Group
  `group.com.benstreich.etude` + `WidgetCenter.reloadAllTimelines()`. The
  WidgetKit extension lives in `targets/widgets/` and is generated at prebuild by
  `@bacons/apple-targets` (plugin registered in app.json). Families: systemSmall,
  systemMedium, accessoryCircular (lock screen).

## Building

- **Android**: `npx expo run:android` (or EAS). Widgets show up in the launcher's
  widget picker as "Étude · Today" and "Étude · Week".
- **iOS**: needs a Mac. `npx expo prebuild -p ios`, open the workspace, set your
  team on the EtudeWidgets target, build. The Swift in `targets/widgets/index.swift`
  has NOT been compiled — expect one round of fixes. The app's App Group
  entitlement is declared in app.json (`ios.entitlements`).

## Known ceilings

- Android widgets refresh instantly on data pushes and every 30 min otherwise.
- RemoteViews can't use the app's custom fonts below API 31 — system sans-serif.
- Streak on the small Android widget uses the 🔥 emoji, not the app's flame glyph.
