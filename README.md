# Étude

A music-practice companion for iOS and Android: track what you practise, for how
long, and how it adds up. Étude is a **paid app, bought once** — there is no
subscription because there is no server to pay for, and there is no server
because your practice log belongs on your phone and nowhere else. The source is
**public so you can read exactly that claim** and check it, not so it can be
reused: see [LICENSE](LICENSE). Start with
[how Étude is built](docs/how-etude-is-built.md) — stack, architecture, what the
analytics compute, and the two things that ever touch the network.

**Features**

- Practice timer with pause / end-and-save / discard, plus quick-log presets for sessions you forgot to time
- Repertoire of pieces and techniques — every logged minute is attributed to what you actually worked on
- Progress on Home: customisable sections (switch, reorder) — which pieces are moving, stars as a per-piece grade, hear first vs latest recording, pipeline, heatmap, goals, insights
- Tools tab: full-screen metronome, tuner, drone, and Practice science — a cited reading list on practising, counter-evidence included
- Log past practice via a full month calendar, splitting minutes across several pieces
- Routines, break reminders, metronome, tuner, recordings you can trim and compare, home-screen widgets
- Localised, dark/light, all data local on device (SQLite) — no account, no server

**Stack** — Expo 57 · React Native · TypeScript · Expo Router · expo-sqlite

## Development

```bash
npm install
npx expo start
```

```bash
npm run check          # the pure-math self-checks, no device needed
npm run check:i18n     # every t() key exists in both locales
npm run check:secrets  # nothing sensitive is tracked
```

Native builds go through [EAS](https://docs.expo.dev/build/introduction/): `eas build --profile preview` for an installable APK, `production` for store bundles. Release steps, and where the signing keys actually live, are in [docs/release.md](docs/release.md).

## Docs

| | |
|---|---|
| [How Étude is built](docs/how-etude-is-built.md) | The tour: stack, architecture, analytics, what leaves the device |
| [Changelog](CHANGELOG.md) | What changed, per store release |
| [Privacy policy](docs/privacy-policy.md) | Short, because there is not much to say |
| [Metronome](docs/metronome.md) · [Widgets](docs/widgets.md) · [Audio identity](docs/audio-identity.md) | The parts with a story |
| [Releasing](docs/release.md) | Build, ship, and the credential runbook |
| [Third-party notices](THIRD-PARTY-NOTICES.md) | Fonts, libraries, services |

## Contributing

**Public, not open to contributions.** Issues, bug reports and ideas are very
welcome — they are what actually moves the app. Code contributions are not
accepted: the licence is proprietary, and a CLA is more overhead than one person
can justify. A pull request will be closed unread, which is nothing personal.

## License

Proprietary — all rights reserved. The source is published for reading and
reference; copying, modifying or redistributing it is not permitted, and the
name "Étude" and everything under `assets/images/` are excluded from even that.
See [LICENSE](LICENSE).
