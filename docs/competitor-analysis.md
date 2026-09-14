# Competitor notes — 2026-09-14

Two apps Ben looked at, compared against Étude as it stands on `main` today.
Store pages could not be fetched from the build environment (Play, App Store and the
vendor sites are blocked by the network policy), so the competitor side rests on the
Musikus GitHub repo (the continuation of PracticeTime!), search-engine snippets of the
listings, and reviews quoted in them. Numbers marked ~ are from those snippets.

## 1. Practice Time! → Musikus

| | |
|---|---|
| Package | `de.practicetime.practicetime` (old listing) → `app.musikus` (same authors, "fork / continuation of PracticeTime!") |
| Who | Michael Prommersberger + Matthias Emde, hobby project, Discord community |
| Price | Free, no IAP, open source (MPL-2.0), also on IzzyOnDroid |
| Platform | **Android only**, native Kotlin, Material 3 default look |
| Status | "open beta", ~43 GitHub stars, ~890 commits, ~60 open issues |

Features: one-tap timer per library item (piece / scale / exercise), session history
with **comment + 1–5 rating**, goals **daily / weekly / monthly**, metronome with tempo,
**subdivision** and beat accents, audio recorder, statistics charts, library with
folders. Timer, metronome and recorder keep running in the background.

Overlap with Étude is large: timer, library, metronome, recorder, goals, stats — roughly
the Étude v1 feature list. What they don't have and Étude does: iOS, repertoire stages,
target tempo + tempo ladder, A/B take compare, routines with per-segment metronome,
widgets, recap cards, break days / relaxed streaks, backups + CSV, theming, DE/EN.

What they have and Étude doesn't:

- Session rating and per-session comment used in statistics → already **#54**.
- Weekly / monthly goals (Étude only has a daily goal).
- Metronome subdivisions (eighths, triplets). Étude has time signatures, compound
  grouping and the ramp, but no subdivision clicks.
- Folders / grouping in the library (Étude: pieces vs techniques, stages, archive).

Threat level: **the** free baseline a Play Store shopper compares against. A paid app
must be visibly better on the first screen, because on a feature checklist the free one
already ticks most boxes. Not a threat on iOS at all.

## 2. Tonic (Pocket Conservatory, Inc.)

| | |
|---|---|
| Package | `com.pocketconservatory.android`, iOS `id1565693172` |
| Who | Ray Chen (violinist), VC-funded startup, launched 2021 |
| Price | Free; IAP for tokens / power-ups / avatar shop |
| Rating | ~4.8 on Play (snippet), reviews: "great idea, needs more work", performance complaints |

Features: **live studios** (stream your practice audio, others listen and chat),
avatars and rooms, XP + tokens + shop, quests / timed challenges, groups, practice
buddies, video uploads for feedback, practice reminders, session record and trends.

The practice *tracker* is a by-product of practising inside the app; the product is the
community. Everything that makes Tonic work — accounts, streaming, chat, an economy —
is exactly what Étude promises not to do (**#55**: no account, no data collection, one
time purchase). Reviewers' complaints (side-chat noise in studios, rule enforcement in
challenges, app performance) are the costs of that model.

Threat level: low as a direct substitute. Different job: Tonic sells *accountability
from other people*, Étude sells *accountability from your own data*. Worth watching
for one thing only: their quests / challenges are the gamified version of Étude's
achievements and monthly recap; an offline "this month" challenge would be the
privacy-friendly analogue if motivation features ever need a push.

## Pricing landscape

| App | Model |
|---|---|
| Musikus / PracticeTime | free, OSS |
| Tonic | free + token IAP |
| Andante | free + **$3.99 one-time** Pro (closest model to Étude) |
| Modacity | $12.99 / mo, $129 / yr |
| Étude | one-time, all updates included (decided 2026-08-19) |

## Where Étude should stand

Pitch against Musikus (Android): "the same tools, but it looks like an instrument, not a
spreadsheet — plus it follows your pieces, not just your minutes." Concretely: stages,
target tempo and tempo ladder, A/B compare, routines, widgets, recap cards.
Pitch against Tonic: "no account, no feed, no one watching. Your practice, on your phone."
Both pitches fit the #55 store copy.

Cheap wins the comparison surfaces (in rough priority):

1. **#54 session rating + deeper stats** — closes the one Musikus feature a reviewer
   will name first.
2. **Weekly goal** next to the daily goal (monthly is optional). Small store change,
   removes a checklist miss.
3. **Metronome subdivisions** — one more click sample and a beat-fraction in the
   scheduler; the ramp and lock-screen transport already put Étude ahead otherwise.
4. Store screenshots that lead with repertoire / tempo ladder / widgets, not the
   timer — the timer is where every competitor looks the same.

Not worth chasing: anything social or account-based, live audio, XP/tokens.
