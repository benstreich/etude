# Progress, tools and the tab bar — design

Date: 2026-09-15. Status: draft for review.

## Why

The progress tab stacks thirteen sections of equal weight, most of them sentences
with sparklines about minutes and streaks. It does not answer the question a
musician opens it for: *are my pieces getting better?* Separately, the metronome
and tuner are two of the most polished parts of the app and are the hardest to
find: two small pills on the Practice screen and a hidden route.

Three pieces of work fix this. They share one spec so they do not drift apart,
and each gets its own implementation plan.

1. **Rating stats** — read the existing 1–5 session stars as a per-piece grade.
2. **Customisable progress** — every section is a "progress definition" the user
   can switch on, off and reorder; a new set of piece-first definitions; the
   customisation is visible on the tab itself.
3. **Tab restructure** — a Tools tab; Progress folds into Home; Settings becomes
   a gear in the Home header.

Build order is the order above: 1 is pure math the sections need, 2 lands on the
existing progress screen, 3 moves the result into Home and adds Tools.

## Decisions taken while brainstorming

- The five-star session rating **is** the grade. No second scale, no per-piece
  prompt. A piece's grade log is derived from its sessions (`Session.title ===
  Piece.name`, the existing convention).
- Rating targets are met by a **rolling average over the last five rated
  sessions** of that piece, never by a single session.
- Customisation is **per section, on/off, drag to reorder**. No presets.
- Default layout when the user never touches it: movement, goals, heatmap,
  volume. It must stand out on its own.
- Tab bar becomes **Home, Practice, Repertoire, Tools** (four). Settings moves
  to a gear icon in the Home header. Appearance stays reachable from Settings.
- The two stat boxes on Settings (total practice, best streak) go; the numbers
  live in the `volume` section on Home.
- Use every signal the store already holds: stars, tempo logs, stages, recordings,
  session minutes, plan runs. If a signal exists and no section reads it, that is
  a gap, not a simplification.
- No new dependencies. Charts stay `react-native-svg`; drag uses the installed
  `react-native-reanimated` + `react-native-gesture-handler`.

---

## Part 1 — Rating stats

### Data

No new capture. New pure module `src/lib/rating-math.ts`:

- `pieceRatings(piece, sessions)` → `{ date, rating }[]` ascending, one entry per
  session that names the piece and has a rating.
- `rollingAvg(ratings, n = 5)` → number | null (null under 2 rated sessions).
- `ratingTrend(ratings, windowDays, todayKey)` → `{ from, to, delta } | null`
  comparing the rolling average at window start and today.
- `ratingForecast(ratings, target, todayKey)` → `{ reachDate } | null`, a least
  squares line through the rolling average of the last 8 weeks, same shape as
  the tempo forecast so the UI treats them alike. Null when the slope is ≤ 0.
- `calibration(piece, sessions, todayKey)` → one of `'grading-feel'` (stars up,
  tempo flat or down over 30 days), `'not-speed'` (tempo at target, rolling
  average ≤ 3), `'hard-days-count'` (last 5 sessions average ≤ 2.5 stars but
  rating trend or tempo delta positive), or `null`.

### Goal target

`Piece` gains `targetRating?: number` (1–5, halves allowed). `deadlineStatus` in
`goal-math.ts` takes the rating forecast alongside stage and tempo: a piece is
on track only if every signal that has a target is on pace. The piece page's
deadline sheet gets the field next to target BPM.

### Review sheet

`session-review.tsx` shows the piece's last rating as a faint marker on the star
row so the user grades relative to last time. No copy change, no nag.

### Progress surfaces

- Movement card (Part 2) shows rating trend as a third signal.
- "Rating over time" section becomes per piece with a picker; the global
  average is dropped.
- Calibration sentence appears inside the movement card row of the piece it
  concerns, not as its own section.

### Check

`scripts/check-rating.ts`: rolling average edges, trend windows, forecast on a
flat and a rising log, each calibration verdict, title matching with a piece
that was renamed (no match, no crash). Wired into `npm run check`.

---

## Part 2 — Customisable progress

### Registry

`src/lib/progress-sections.ts`:

```ts
export type SectionKey = 'movement' | 'goals' | 'heatmap' | 'volume' | 'hear'
  | 'pipeline' | 'performable' | 'changed' | 'insights' | 'timeByFocus'
  | 'drift' | 'consistency' | 'rating' | 'timeOfDay' | 'sessionLength' | 'last7';
export const PROGRESS_SECTIONS: { key: SectionKey; defaultOn: boolean }[]; // ordered
export function resolveLayout(saved: Layout, registry = PROGRESS_SECTIONS): Layout;
```

`resolveLayout` keeps the saved order, appends unknown-to-saved registry keys
with their default, drops keys the registry no longer has. Pure.

Store gains `progressLayout: { key: string; on: boolean }[]`, default `[]`,
persisted with the other settings. Empty means "registry default".

### Screen

The progress screen keeps header, instrument filter, share, recap and empty
state; the body is `resolveLayout(store.progressLayout).filter(on).map(render)`.
Each current block moves to `src/components/progress/<key>.tsx` unchanged in
behaviour. A section with nothing to show returns `null`. Screen file target:
under 200 lines.

### Visible customisation

A **"Customise" text button sits at the end of the section list**, and a small
sliders icon sits in the header next to share. Both open the layout sheet.
First launch after the update shows a one-time hint under the header: "This tab
is yours — switch sections on and off" with a dismiss. The sheet is also
reachable from Settings → "Progress sections".

### Layout sheet

`src/components/progress-layout-sheet.tsx`: every section, translated label,
one-line description, switch, drag handle. Reanimated drag, about 60 lines.
"Reset to default" at the bottom writes `[]`. Saves on every change.

### New sections

All respect the instrument filter and skip archived pieces.

**movement** (default on, headline). Up to five rows, tap opens the piece. Row:
name, stage dots, 30-day tempo sparkline (`MiniTrend`) with target BPM as a
faint line, rating trend as "★ 3.2 → 4.4", one chip naming the movement. Chip
rule order, first match wins: stage changed in window → "stage A → B"; tempo
delta ≥ 3 BPM → "+N BPM"; rating delta ≥ 0.5 → "+0.8 ★"; no session ≥ 14 days
→ "stalled N days"; last stage and unplayed ≥ 21 days → "due"; else "new".
Ranking: stage, tempo, rating moves by size, then stalled, due, new. Footer
"All pieces" opens Repertoire. Pure math in `src/lib/movement-math.ts`.

**goals** (default on). Existing goals + deadlines block, one card.

**heatmap** (default on). Existing heatmap and day detail, unchanged.

**volume** (default on). The three stat tiles collapse into one row: this week,
avg/day, all time.

**hear**. "Hear the difference": for each piece with ≥ 2 recordings, the first
and the latest recording as two play buttons with dates and the days between.
Starred recordings win over first/latest when present. Reuses the recordings
player. Up to three pieces, "more" opens the piece.

**pipeline**. Pieces per stage as a horizontal stacked bar with counts, plus
"N reached Ready this month, M last month". Needs the stage log below.

**performable**. Pieces at the last stage, each with a freshness bar that fades
from full at 0 days since last played to empty at 30. Sorted freshest first.

**changed**. "Since last month" diff card: pieces added, pieces promoted,
hours, BPM gained across pieces, average stars, each as `value (±delta)`.

Existing sections keep their keys and default **off**: insights, timeByFocus,
drift, consistency, rating (now per piece, Part 1), timeOfDay, sessionLength,
last7.

### Stage log

`Piece` gains `stageLog?: { date: string; stage: number }[]`, appended by the
store whenever `stage` changes, kept ascending, one entry per day (last write
wins). Backfill on migration: one entry at `addedAt` (or today) with the current
stage so existing pieces are not "new" forever. `pieceMovement` and the pipeline
count read it. Without it "reached Ready this month" cannot exist.

### Checks and i18n

`scripts/check-movement.ts` (chip rule order, ranking, thresholds, stage log
append and backfill, `resolveLayout` with stale/extra keys). New keys under
`progress.*` and `settings.*` in `en.json` and `de.json`; `check:i18n` passes.

---

## Part 3 — Tab restructure

### Tab bar

`Home, Practice, Repertoire, Tools`. `progress` and `profile` become
`href: null` routes that still exist so deep links and the layout sheet's
Settings entry keep working. Home's header gets a gear icon → `/profile`.
`tabs.progress` / `tabs.settings` strings stay for those screens' titles.

### Home

Home today: greeting, Start practicing, quick log, first-session guide. It
becomes the greeting, the primary button and quick log **above** the progress
section list from Part 2. Progress' own header (title, share, filter) merges into
Home's header row. The first-session guide keeps showing while there are no
sessions; the section list shows its empty state below it.

### Tools

New `src/app/tools.tsx` with a grid of tool cards:

- **Metronome** → `/metronome`, a new full-screen page built from the existing
  metronome sheet's engine (`src/lib/metronome.tsx`): large BPM, tempo term, tap
  tempo, subdivisions, presets. The sheet stays for use inside Practice.
- **Tuner** → existing `/tuner`, promoted from hidden.
- **Drone** → `/drone`, a sustained reference pitch with note picker and octave,
  generated like the other sounds (`scripts/` audio generators, `expo-audio`).
- **Tap tempo** lives inside the metronome page, not as its own card.

Cards later (out of scope): ear trainer, practice stopwatch.

### Practice screen

The tuner and metronome pills stay; they are the in-session shortcuts.

### Checks

Existing `check:metronome` and `check:tuner` unchanged. Drone gets
`scripts/check-drone.ts` for the frequency table. Manual: every tab, gear opens
Settings, back from Tuner and Metronome returns to Tools.

---

## Out of scope

Presets, per-section options (window length), a second grading scale,
dimensions per rating, teacher grading, a stage history UI, ear trainer,
stopwatch, any new chart library, changes to widgets.

## Risks

- **Title matching.** Sessions name pieces by string. Renaming a piece orphans
  its ratings. Existing behaviour, accepted; `pieceRatings` must not crash on
  it. A future `pieceId` on sessions would fix it and is noted, not built.
- **Four tabs** removes a visible Settings entry. The gear must be in the same
  header position on Home every time; onboarding copy that says "Settings tab"
  must be updated (`grep -n settings src/locales`).
- **Reanimated drag** inside a bottom sheet with a ScrollView is the one part
  with fiddly gesture handling. If it fights, ship up/down arrows and file the
  drag as a follow-up; the layout sheet's API does not change.
- **Stage log backfill** runs once in `migrate.ts`; must be idempotent.
