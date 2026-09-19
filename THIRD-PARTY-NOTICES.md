# Third-party notices

Étude ships other people's work. This file is the required notice and the
honest credit. The app's own source is covered by [LICENSE](LICENSE); nothing
here changes that, and nothing in LICENSE restricts the components below.

## Fonts

All three typefaces are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).
The first two are bundled via the `@expo-google-fonts` packages; Bravura is
vendored directly, as `assets/fonts/Bravura.otf`.

| Font | Used for | Copyright |
|---|---|---|
| **Space Grotesk** (Regular, Medium, SemiBold) | Everything — headings and body alike | © Florian Karsten |
| **Newsreader** (Italic, Medium Italic) | The musical voice: tempo terms, "of N min" counters, note placeholders | © Production Type |
| **Bravura** 1.482 | The notation itself: clefs, noteheads, flags, rests, accidentals and time signatures on the practice staff and the full score | © Steinberg Media Technologies GmbH |

The OFL permits bundling in an application. None of the three is sold on its
own, and none is renamed.

Bravura *does* carry the Reserved Font Name "Bravura" — unlike the other two.
That is not a conflict here: the OFL reserves the name only against **modified**
versions, and this app ships the file exactly as Steinberg published it. Should
the font ever be edited, the copy must be renamed before it is redistributed.
Bravura is also the SMuFL reference font, and `src/lib/engrave.ts` is built
against its published metrics.

## Frameworks and libraries

MIT licensed unless noted, and installed from npm — `package.json` is the exact
list, `package-lock.json` the exact versions.

- **React Native** and **React** — Meta
- **Expo** SDK 57, **Expo Router**, and the `expo-*` modules the app uses:
  audio, sqlite, file-system, notifications, haptics, localization, updates,
  document-picker, sharing, store-review, splash-screen, symbols, glass-effect
- **react-native-safe-area-context**, **react-native-screens**,
  **react-native-gesture-handler**, **react-native-reanimated**,
  **react-native-svg**, **react-native-view-shot**
- **i18n-js**
- **@react-native-async-storage/async-storage**

## Network services

Étude has no backend and no account. Two things leave the device, both
optional to the app working:

- **iTunes Search API** (`itunes.apple.com/search`) — used only to suggest a
  title and artist while you are typing a piece's name. The query is the text
  you typed, no key, no identifier, nothing stored. Suggestions are a
  convenience; typing the name by hand works identically.
- **Expo Updates** (`expo.dev`) — checks for a JavaScript update on launch. It
  sends the runtime version, platform, and the current update id so the server
  can answer "newer bundle" or "nothing". No practice data, ever.

Everything else — sessions, recordings, statistics — stays in the SQLite file
on the device. See [docs/privacy-policy.md](docs/privacy-policy.md).

## Ours

The audio is generated, not sampled: the two identity cues
(`scripts/make-cues.py`) and the metronome click sets (`scripts/make-click.py`)
are synthesised from arithmetic in this repo, so there are no sample-library
rights to clear. They are part of the app and covered by LICENSE.
