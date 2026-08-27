# Etude

A music-practice companion for iOS and Android. Track what you practice, for how long, and how it adds up.

**Features**

- Practice timer with pause / end-and-save / discard, plus quick-log presets for sessions you forgot to time
- Repertoire of pieces and techniques — every logged minute is attributed to what you actually worked on
- Progress: weekly and all-time stats, time-by-focus breakdown, tappable day-by-day history
- Log past practice via a full month calendar, splitting minutes across several pieces
- Metronome, practice recordings you can listen back to, and home-screen widgets
- Localised, dark/light, all data local on device (SQLite) — no account, no server

**Stack** — Expo 57 · React Native · TypeScript · Expo Router · expo-sqlite

## Development

```bash
npm install
npx expo start
```

Native builds go through [EAS](https://docs.expo.dev/build/introduction/): `eas build --profile preview` for an installable APK, `production` for store bundles.

## License

MIT — see [LICENSE](LICENSE).
