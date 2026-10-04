# Widgets (#17, feature 6)

Widgets need a native build — they never appear in Expo Go.

## How it works

After anything that changes today's numbers, `WidgetSync` (mounted in the Shell)
pushes `{day, today, goal, streak, streakDays, week[7], nextFocus, accentLight[3], accentDark[3], labels}` through the local module
`modules/etude-widgets`. `labels` carries the widget's strings in the in-app
language (English is the native fallback). `day` lets both platforms roll a stale
snapshot over after midnight — today 0, the week shifted, and the streak zeroed once
the gap is longer than `streakDays` (how long the app's own streak rules, grace and
break days included, keep it alive with no more practice) —
since only the running app ever writes one; iOS also schedules a timeline refresh
at midnight.

- **Android**: written to `SharedPreferences("etude.widgets")`, then both
  `AppWidgetProvider`s repaint. The providers, layouts, and manifest receivers all
  live inside the module (library manifest merging) — `android/app` is untouched.
  Two widgets: small (goal ring + streak + minutes) and medium (minutes, streak +
  next piece, Practice deep-link pill via `etude://practice`, 7 week bars).
  Ring and bars are drawn as bitmaps (RemoteViews has no arc primitive).
  Widget colors follow the in-app accent (#80): the snapshot carries an
  `[accent, mid, soft]` triple per scheme and the providers paint with the one
  matching the launcher's night mode; `colors.xml` terracotta is the fallback
  until the app has pushed a snapshot. The Practice pill tint needs API 31.
- **iOS (UNVERIFIED scaffold)**: written to the App Group
  `group.com.benstreich.etude` + `WidgetCenter.reloadAllTimelines()`. The
  WidgetKit extension lives in `targets/widgets/` and is generated at prebuild by
  `@bacons/apple-targets` (plugin registered in app.json). Families: systemSmall,
  systemMedium, accessoryCircular (lock screen).

## Building

- **Android**: `npx expo run:android` (or EAS). Widgets show up in the launcher's
  widget picker as "Étude · Today" and "Étude · Week".
- **iOS**: needs a Mac. `npx expo prebuild -p ios`, open the workspace, set your
  team on the EtudeWidgetExtension target, build. The Swift in `targets/widgets/index.swift`
  has NOT been compiled — expect one round of fixes. The app's App Group
  entitlement is declared in app.json (`ios.entitlements`).

## Known ceilings

- Android widgets refresh instantly on data pushes and every 30 min otherwise.
- RemoteViews can't use the app's custom fonts below API 31 — system sans-serif.
- Streak on the small Android widget uses the 🔥 emoji, not the app's flame glyph.
