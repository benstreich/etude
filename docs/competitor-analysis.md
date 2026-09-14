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

## What the subscription apps lock behind the paywall (2026-09-14)

Store pages were unreachable from the build environment; the lists below come from
the apps' own sites and blog posts as quoted by search results.

| App | Price | Free tier | Behind the paywall |
|---|---|---|---|
| **Legato** (ProximityLabs, "LegatoPlus") | $3.99/mo · $14.99/6 mo · $19.99/yr | tracker, multi-instrument profiles, daily goal + streaks, stats, routines, drills, metronome/tuner *outside* a session | using tools *during* a running session, cloud sync, advanced metronome (flexible tempos, subdivisions, accent patterns), live pitch graph, vibrato analysis, score scanning into a PDF library, audio recording in session |
| **Modacity** | $12.99/mo · $129/yr | 10 items, 2 lists, 1 folder, 1 note + 1 recording per item, 3 deliberate-practice cycles/day, basic metronome + drone, basic stats | unlimited everything, tags, full history + statistics, practice breaks, advanced metronome, tuner, drone, unlimited notes |
| **Andante** | $2.99/mo · $17.99/yr · $29.99 lifetime (was $3.99 one-time) | one journal, timer, basic log | multiple journals/profiles, session notes, drone tuner, reminders, folders, CSV export, Siri shortcuts |
| **Practis** | $4.99/mo · $39.99/yr | timer, metronome, diary, streaks | analytics, collections with deadlines, routines, achievements (exact split unpublished) |

### Already in Étude at one price

Unlimited pieces / sessions / notes / recordings · full history and time-by-focus stats ·
metronome with time signatures, ramp and lock-screen transport · recording *during* the
session, waveform, star, A/B compare · routines with per-segment metronome · reminders ·
CSV export + full backup/restore · widgets · tempo ladder · recap cards · theming.
That covers most of Modacity Premium and all of Andante Pro except drone and profiles.

### Gaps that recur behind paywalls

| Gap | Who gates it | Effort in Étude |
|---|---|---|
| **Drone tones** | Legato, Modacity, Andante | small: 12 generated looping samples like the click set, pitch + octave picker in the metronome sheet |
| **Tuner** (pitch detection) | Legato, Modacity | medium: needs raw mic PCM, so a third local Expo module (Kotlin/Swift, YIN or MPM); UI is a needle + cents |
| **Metronome subdivisions + accent patterns** | Legato, Modacity | small: extra click sample, beat fraction in the scheduler, per-beat accent toggles |
| **Session rating + deeper stats** (#54) | Modacity (full stats) | small–medium |
| **Per-instrument tracking** | Legato (free), Andante (Pro) | medium: instrument on Session/Piece, filter in Progress; `settings.instruments` exists but nothing is tagged today |
| **Weekly / monthly goal** | Musikus (free) | small |
| **Practice breaks / focus cycles** | Modacity | small: optional break segment in routines or a "break every N min" toggle on the timer |
| **Score attached to a piece** | Legato (scan → PDF), tuneUPGRADE | medium: image/PDF via `expo-document-picker` (already a dependency), shown from the piece page and the running session |
| Cloud sync | Legato, Modacity | **skip** by design; substitute is the existing backup file plus "save automatic backups to a folder I choose" (system picker → Drive/iCloud, still no account) |
| Live pitch graph, vibrato analysis | Legato | skip: strings-only niche, heavy DSP |
| Social / friends | Practis, Tonic | skip |

### Pricing note

Andante moved from a $3.99 one-time unlock to $29.99 lifetime / $17.99 a year, which
says the low one-time price did not carry the app. Two store models fit "one-time, no
subscription": paid-upfront (no trial, refunds only) or free download with a single
"Étude Full" unlock. The unlock form lets people try the timer before paying and still
honours #55; it also gives a natural free tier (timer + log) without feature nagging.
