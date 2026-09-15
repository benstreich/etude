# Progress, Tools and Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the progress tab into a customisable, piece-first set of "progress definitions" fed by every signal the store already holds (stars, tempo logs, stages, recordings, sessions), fold it into Home, and give the metronome, tuner and a new drone a Tools tab.

**Architecture:** Pure math modules under `src/lib/*-math.ts` (no React, tested by `scripts/check-*.ts` with `node:assert`), one section registry that maps keys to components under `src/components/progress/`, a persisted `progressLayout` setting, and Expo Router file-tree changes for the tab bar. Store changes are additive (`stageLog`, `targetRating`, `progressLayout`) and backfilled in `migrate.ts`.

**Tech Stack:** Expo 57, React Native, TypeScript, Expo Router, `react-native-svg`, `react-native-reanimated` 4.5 + `react-native-gesture-handler` 2.32 (already installed), `expo-audio`, Node 22 `--experimental-strip-types` for checks.

**Spec:** `docs/superpowers/specs/2026-09-15-progress-tools-redesign-design.md`

## Global Constraints

- No new npm dependencies.
- Read the Expo v57 docs (`https://docs.expo.dev/versions/v57.0.0/`) before touching router, audio or file APIs (`AGENTS.md`).
- Every new `t('...')` key exists in **both** `src/locales/en.json` and `src/locales/de.json`; `npm run check:i18n` must pass.
- Every new pure module gets a `scripts/check-<name>.ts` wired into the `check` script in `package.json`; `npm run check` must pass before each commit.
- Sessions name a piece by `session.title === piece.name` (string). Never crash on a rename; unmatched sessions are simply not that piece's.
- Store mutations are `setState((s) => ...)` returning a new object; persisted fields are seeded in the settings seed so the shallow merge backfills them.
- Commit after every task with a conventional-commit message. No push.
- Dates are `dateKey` strings `YYYY-MM-DD`; "today" is always passed in as `todayKey`, never read from `Date` inside math modules.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/rating-math.ts` | per-piece rating log, rolling average, trend, forecast, calibration |
| `src/lib/movement-math.ts` | movement chip per piece, ranking, stage-log helpers, pipeline counts, freshness, month diff |
| `src/lib/progress-sections.ts` | registry of section keys, defaults, `resolveLayout` |
| `src/components/progress/*.tsx` | one file per section, exported through `index.ts` as `SECTIONS: Record<SectionKey, FC<SectionProps>>` |
| `src/components/progress-layout-sheet.tsx` | on/off + drag reorder sheet |
| `src/app/index.tsx` | Home: greeting, today, start, quick log, then the section list + Customise |
| `src/app/progress.tsx` | thin: renders `<ProgressBody />` (kept as hidden route for deep links) |
| `src/app/tools.tsx`, `src/app/metronome.tsx`, `src/app/drone.tsx` | Tools tab and its two new pages |
| `src/lib/drone.ts` | note table + frequency math for the drone |
| `src/lib/store.tsx`, `src/lib/migrate.ts` | `stageLog`, `targetRating`, `progressLayout`, `appendStageLog`, backfill |
| `scripts/check-rating.ts`, `scripts/check-movement.ts`, `scripts/check-drone.ts` | the checks |

---

# Part 1 — Rating stats

### Task 1: rating-math

**Files:**
- Create: `src/lib/rating-math.ts`
- Create: `scripts/check-rating.ts`
- Modify: `package.json` (`check` script + `check:rating`)

**Interfaces:**
- Consumes: `Piece`, `Session`, `TempoEntry` types from `@/lib/store`.
- Produces:
  ```ts
  export type RatingEntry = { date: string; rating: number };
  export function pieceRatings(piece: { name: string }, sessions: { title: string; date: string; rating?: number; at?: number }[]): RatingEntry[];
  export function rollingAvg(ratings: RatingEntry[], n = 5): number | null;     // null when < 2 rated
  export function ratingTrend(ratings: RatingEntry[], windowDays: number, todayKey: string): { from: number; to: number; delta: number } | null;
  export function ratingForecast(ratings: RatingEntry[], target: number, todayKey: string): { reachDate: string } | null;
  export type Calibration = 'grading-feel' | 'not-speed' | 'hard-days-count';
  export function calibration(p: { tempoLog?: TempoEntry[]; targetBpm?: number; currentBpm?: number }, ratings: RatingEntry[], todayKey: string): Calibration | null;
  export const addDays: (key: string, n: number) => string;  // re-export if store already has one, else implement here
  ```

- [ ] **Step 1: Write the failing check**

```ts
// scripts/check-rating.ts
// Stars are the grade (#spec 2026-09-15): the rolling average, trend, forecast
// and calibration verdicts have to hold on tiny, gappy logs.
import assert from 'node:assert';
import { calibration, pieceRatings, ratingForecast, ratingTrend, rollingAvg } from '../src/lib/rating-math.ts';

const piece = { name: 'Asturias' };
const sessions = [
  { title: 'Asturias', date: '2026-08-01', rating: 2 },
  { title: 'Asturias', date: '2026-08-08', rating: 3 },
  { title: 'Scales', date: '2026-08-08', rating: 5 },        // other focus
  { title: 'Asturias', date: '2026-08-15' },                  // unrated: skipped
  { title: 'Asturias', date: '2026-08-22', rating: 3 },
  { title: 'Asturias', date: '2026-08-29', rating: 4 },
  { title: 'Asturias', date: '2026-09-05', rating: 4 },
  { title: 'Asturias', date: '2026-09-12', rating: 5 },
];
const r = pieceRatings(piece, sessions);
assert.deepEqual(r.map((x) => x.rating), [2, 3, 3, 4, 4, 5]);
assert.equal(pieceRatings({ name: 'Renamed' }, sessions).length, 0);

assert.equal(rollingAvg([]), null);
assert.equal(rollingAvg(r.slice(0, 1)), null);
assert.equal(rollingAvg(r), (3 + 3 + 4 + 4 + 5) / 5);
assert.equal(rollingAvg(r, 2), 4.5);

const tr = ratingTrend(r, 30, '2026-09-14')!;
assert.ok(tr.delta > 0 && tr.to > tr.from);
assert.equal(ratingTrend(r.slice(0, 1), 30, '2026-09-14'), null);

const fc = ratingForecast(r, 5, '2026-09-14');
assert.ok(fc && fc.reachDate > '2026-09-14', 'rising log forecasts a date');
assert.equal(ratingForecast([{ date: '2026-09-01', rating: 3 }, { date: '2026-09-08', rating: 3 }, { date: '2026-09-12', rating: 3 }], 5, '2026-09-14'), null, 'flat log: no forecast');

// calibration
const flatTempo = { tempoLog: [{ date: '2026-08-15', bpm: 100 }, { date: '2026-09-12', bpm: 100 }], targetBpm: 140 };
assert.equal(calibration(flatTempo, r, '2026-09-14'), 'grading-feel');
const atTarget = { tempoLog: [{ date: '2026-09-12', bpm: 140 }], targetBpm: 140, currentBpm: 140 };
const low = [3, 3, 2, 3, 3].map((rating, i) => ({ date: `2026-09-0${i + 1}`, rating }));
assert.equal(calibration(atTarget, low, '2026-09-14'), 'not-speed');
const hardDays = [2, 2, 3, 2, 3].map((rating, i) => ({ date: `2026-09-0${i + 1}`, rating }));
const climbing = { tempoLog: [{ date: '2026-08-15', bpm: 90 }, { date: '2026-09-12', bpm: 110 }], targetBpm: 140 };
assert.equal(calibration(climbing, hardDays, '2026-09-14'), 'hard-days-count');
assert.equal(calibration({}, [], '2026-09-14'), null);
console.log('check-rating ok');
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /c/dev/x/etude && node --experimental-strip-types --no-warnings scripts/check-rating.ts`
Expected: `Cannot find module '../src/lib/rating-math.ts'`

- [ ] **Step 3: Implement**

```ts
// src/lib/rating-math.ts
// Stars are the grade. A piece's log is derived from the sessions that name it.
import type { TempoEntry } from './store';

export type RatingEntry = { date: string; rating: number };
export type Calibration = 'grading-feel' | 'not-speed' | 'hard-days-count';

export const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayNum = (key: string) => Math.round(new Date(key + 'T12:00:00').getTime() / 86_400_000);

export function pieceRatings(piece: { name: string }, sessions: { title: string; date: string; rating?: number; at?: number }[]): RatingEntry[] {
  return sessions
    .filter((s) => s.title === piece.name && typeof s.rating === 'number')
    .sort((a, b) => (a.date === b.date ? (a.at ?? 0) - (b.at ?? 0) : a.date < b.date ? -1 : 1))
    .map((s) => ({ date: s.date, rating: s.rating! }));
}

export function rollingAvg(ratings: RatingEntry[], n = 5): number | null {
  if (ratings.length < 2) return null;
  const tail = ratings.slice(-n);
  return tail.reduce((a, r) => a + r.rating, 0) / tail.length;
}

export function ratingTrend(ratings: RatingEntry[], windowDays: number, todayKey: string) {
  const cut = addDays(todayKey, -windowDays);
  const before = ratings.filter((r) => r.date <= cut);
  const from = rollingAvg(before.length >= 2 ? before : ratings.slice(0, 2));
  const to = rollingAvg(ratings);
  if (from === null || to === null) return null;
  return { from, to, delta: to - from };
}

// least squares over the rolling average of the last 8 weeks, mirrors tempoForecast
export function ratingForecast(ratings: RatingEntry[], target: number, todayKey: string): { reachDate: string } | null {
  const cut = addDays(todayKey, -56);
  const recent = ratings.filter((r) => r.date >= cut);
  if (recent.length < 3) return null;
  const pts = recent.map((_, i) => ({ x: dayNum(recent[i].date), y: rollingAvg(recent.slice(0, i + 1)) ?? recent[i].rating }));
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx;
  if (slope <= 1e-6) return null;
  const last = pts[n - 1];
  if (last.y >= target) return { reachDate: todayKey };
  const days = Math.ceil((target - last.y) / slope);
  return { reachDate: addDays(recent[n - 1].date, Math.min(days, 730)) };
}

export function calibration(p: { tempoLog?: TempoEntry[]; targetBpm?: number; currentBpm?: number }, ratings: RatingEntry[], todayKey: string): Calibration | null {
  const avg = rollingAvg(ratings);
  if (avg === null) return null;
  const cut = addDays(todayKey, -30);
  const log = p.tempoLog ?? [];
  const inWin = log.filter((e) => e.date >= cut);
  const tempoDelta = inWin.length >= 2 ? inWin[inWin.length - 1].bpm - inWin[0].bpm : 0;
  const trend = ratingTrend(ratings, 30, todayKey);
  const atTarget = !!p.targetBpm && (p.currentBpm ?? log[log.length - 1]?.bpm ?? 0) >= p.targetBpm;
  if (atTarget && avg <= 3) return 'not-speed';
  if (avg <= 2.5 && ((trend && trend.delta > 0) || tempoDelta > 0)) return 'hard-days-count';
  if (trend && trend.delta >= 0.5 && inWin.length >= 2 && tempoDelta <= 0) return 'grading-feel';
  return null;
}
```

- [ ] **Step 4: Wire the check and run it**

In `package.json` add `"check:rating": "node --experimental-strip-types --no-warnings scripts/check-rating.ts"` and append `&& npm run check:rating` to `check`.
Run: `node --experimental-strip-types --no-warnings scripts/check-rating.ts` → `check-rating ok`. Adjust thresholds only if an assertion fails for a reason that reveals a wrong rule, not to make the test pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rating-math.ts scripts/check-rating.ts package.json
git commit -m "feat(progress): rating math — stars read as a per-piece grade"
```

### Task 2: targetRating on pieces, deadline status, review-sheet marker

**Files:**
- Modify: `src/lib/store.tsx` (`Piece.targetRating?: number`; `updatePiece` pick adds `'targetRating'`)
- Modify: `src/lib/goal-math.ts` (`deadlineStatus` gains optional rating inputs)
- Modify: `src/app/piece/[id].tsx` (target rating field beside target BPM in the tempo/deadline sheet; deadline line uses the new status)
- Modify: `src/components/session-review.tsx` (last rating marker under the stars)
- Modify: `scripts/check-goal.ts` (rating branch)
- Modify: `src/locales/en.json`, `src/locales/de.json`

**Interfaces:**
- Consumes: `ratingForecast`, `rollingAvg`, `pieceRatings` from Task 1.
- Produces: `deadlineStatus(o: DeadlineOpts & { ratingAvg?: number | null; targetRating?: number; ratingReachDate?: string | null })` — read the current `DeadlineOpts` first and extend, do not rename existing fields. Its return gains `lagging: ('stage' | 'tempo' | 'rating')[]`.

- [ ] **Step 1: Failing check** — append to `scripts/check-goal.ts`:

```ts
// rating target: on track only if the forecast lands before the deadline
const base = { /* copy an existing passing deadlineStatus call's opts from above in this file */ } as any;
const withRating = deadlineStatus({ ...base, targetRating: 4.5, ratingAvg: 3.2, ratingReachDate: '2027-01-01' });
assert.ok(withRating.lagging.includes('rating'));
const ratingOk = deadlineStatus({ ...base, targetRating: 4.5, ratingAvg: 4.6, ratingReachDate: null });
assert.ok(!ratingOk.lagging.includes('rating'));
```

- [ ] **Step 2: Run** `npm run check:goal` → fails on `lagging`.
- [ ] **Step 3: Implement** in `goal-math.ts`: compute `lagging` (`stage` when stage pace behind as today; `tempo` when a target BPM exists and the tempo forecast (already passed in or computed by the caller) is after the deadline; `rating` when `targetRating` set and `ratingAvg < targetRating` and (`ratingReachDate` null or after the deadline)). `onTrack = lagging.length === 0`. Keep old return fields.
- [ ] **Step 4:** Piece page: in the sheet that edits `targetBpm`, add a `Stars` control (size 22) bound to `targetRating` with a clear button; deadline row appends `store.t('piece.lagging', { list })` when `lagging.length`. Keys: `piece.targetRating` "Target rating", `piece.lagging` "behind on %{list}", `piece.ratingWord` "rating", `piece.tempoWord` "tempo", `piece.stageWord` "stage" (+ German: "Zielbewertung", "im Rückstand bei %{list}", "Bewertung", "Tempo", "Stufe").
- [ ] **Step 5:** Review sheet: compute `last = pieceRatings({ name: session.title }, store.sessions.filter(s => s.id !== session.id)).at(-1)?.rating`; render under `<Stars>` a `Text` `store.t('sessionReview.lastTime', { n: last })` when defined. Keys: `sessionReview.lastTime` "Last time: %{n} ★" / "Letztes Mal: %{n} ★".
- [ ] **Step 6:** `npm run check && npm run check:i18n` green. Commit: `feat(piece): target rating on deadlines, last-time marker in the review sheet`.

---

# Part 2 — Customisable progress

### Task 3: stage log + progressLayout in the store and migration

**Files:**
- Modify: `src/lib/store.tsx`
- Modify: `src/lib/migrate.ts`
- Create: `src/lib/movement-math.ts` (only `appendStageLog`, `backfillStageLog` for now; the rest in Task 5)
- Create: `scripts/check-movement.ts` (stage-log part), `package.json` wiring

**Interfaces:**
- Produces:
  ```ts
  // store.tsx
  export type StageEntry = { date: string; stage: number };
  // Piece gains: stageLog?: StageEntry[];
  // Settings gains: progressLayout: { key: string; on: boolean }[];   seed: []
  // movement-math.ts
  export function appendStageLog(log: StageEntry[] | undefined, date: string, stage: number): StageEntry[]; // ascending, one per day, last write wins, no-op if same stage as last entry
  export function backfillStageLog(p: { stage: number; stageLog?: StageEntry[]; addedAt?: number }, todayKey: string): StageEntry[];
  ```

- [ ] **Step 1: Failing check**

```ts
// scripts/check-movement.ts
import assert from 'node:assert';
import { appendStageLog, backfillStageLog } from '../src/lib/movement-math.ts';

assert.deepEqual(appendStageLog(undefined, '2026-09-01', 1), [{ date: '2026-09-01', stage: 1 }]);
assert.deepEqual(appendStageLog([{ date: '2026-09-01', stage: 1 }], '2026-09-01', 2), [{ date: '2026-09-01', stage: 2 }], 'same day: last write wins');
assert.deepEqual(appendStageLog([{ date: '2026-09-01', stage: 1 }], '2026-09-03', 1), [{ date: '2026-09-01', stage: 1 }], 'same stage: no-op');
assert.deepEqual(backfillStageLog({ stage: 2, addedAt: Date.parse('2026-05-04T10:00:00Z') }, '2026-09-14'), [{ date: '2026-05-04', stage: 2 }]);
assert.deepEqual(backfillStageLog({ stage: 0 }, '2026-09-14'), [{ date: '2026-09-14', stage: 0 }]);
assert.deepEqual(backfillStageLog({ stage: 1, stageLog: [{ date: '2026-01-01', stage: 1 }] }, '2026-09-14'), [{ date: '2026-01-01', stage: 1 }], 'existing log untouched');
console.log('check-movement ok');
```

- [ ] **Step 2:** run → module missing.
- [ ] **Step 3:** implement the two functions; in `store.tsx` every place that writes `stage` (the cycle function at ~L535, `updatePiece` when `patch.stage !== undefined`, the ready/unready path at ~L644) also sets `stageLog: appendStageLog(p.stageLog, today, stage)`. In `migrate.ts` after the pieces are known: `merged.pieces = merged.pieces.map(p => ({ ...p, stageLog: backfillStageLog(p, todayKey) }))` — `migrate` has no today; pass `dateKey()` from the caller or compute inside with `new Date().toISOString().slice(0,10)` (acceptable here: migration runs once on device). Seed `progressLayout: []` in the settings seed; add to `Settings` type; `updateSettings` already accepts a partial.
- [ ] **Step 4:** wire `check:movement`, `npm run check` green. Commit: `feat(store): stage log on pieces, progressLayout setting`.

### Task 4: section registry + extraction of existing sections + thin screen

**Files:**
- Create: `src/lib/progress-sections.ts`
- Create: `src/components/progress/index.ts`, `types.ts`, `goals.tsx`, `heatmap.tsx`, `volume.tsx`, `insights.tsx`, `time-by-focus.tsx`, `drift.tsx`, `consistency.tsx`, `rating.tsx`, `time-of-day.tsx`, `session-length.tsx`, `last7.tsx`, `body.tsx`
- Modify: `src/app/progress.tsx` → thin wrapper
- Modify: `scripts/check-movement.ts` (resolveLayout part)

**Interfaces:**
```ts
// progress-sections.ts
export type SectionKey = 'movement' | 'goals' | 'heatmap' | 'volume' | 'hear' | 'pipeline' | 'performable' | 'changed'
  | 'insights' | 'timeByFocus' | 'drift' | 'consistency' | 'rating' | 'timeOfDay' | 'sessionLength' | 'last7';
export type LayoutItem = { key: string; on: boolean };
export const PROGRESS_SECTIONS: { key: SectionKey; defaultOn: boolean }[] = [
  { key: 'movement', defaultOn: true }, { key: 'goals', defaultOn: true }, { key: 'heatmap', defaultOn: true }, { key: 'volume', defaultOn: true },
  { key: 'hear', defaultOn: false }, { key: 'pipeline', defaultOn: false }, { key: 'performable', defaultOn: false }, { key: 'changed', defaultOn: false },
  { key: 'insights', defaultOn: false }, { key: 'timeByFocus', defaultOn: false }, { key: 'drift', defaultOn: false }, { key: 'consistency', defaultOn: false },
  { key: 'rating', defaultOn: false }, { key: 'timeOfDay', defaultOn: false }, { key: 'sessionLength', defaultOn: false }, { key: 'last7', defaultOn: false },
];
export function resolveLayout(saved: LayoutItem[], registry = PROGRESS_SECTIONS): { key: SectionKey; on: boolean }[];

// components/progress/types.ts
export type SectionProps = {
  sessions: Session[];          // already instrument-filtered
  pieces: Piece[];              // instrument-filtered, archived excluded
  period: FocusPeriod;
  setPeriod: (p: FocusPeriod) => void;
  selDate: string; setSelDate: (d: string) => void;   // heatmap selection, owned by body
  onEditSession: (s: Session) => void;
};
// components/progress/index.ts
export const SECTIONS: Record<SectionKey, React.FC<SectionProps>>;
// components/progress/body.tsx
export function ProgressBody({ header }: { header?: React.ReactNode }): JSX.Element;  // owns period/selDate/edit-sheet state, renders sections, Customise button, layout sheet
```

- [ ] **Step 1: Failing check** — append to `scripts/check-movement.ts`:

```ts
import { PROGRESS_SECTIONS, resolveLayout } from '../src/lib/progress-sections.ts';
assert.deepEqual(resolveLayout([]), PROGRESS_SECTIONS.map((s) => ({ key: s.key, on: s.defaultOn })), 'empty = defaults');
const saved = [{ key: 'heatmap', on: true }, { key: 'zombie', on: true }, { key: 'movement', on: false }];
const res = resolveLayout(saved);
assert.deepEqual(res.slice(0, 2).map((x) => x.key), ['heatmap', 'movement'], 'saved order kept, unknown dropped');
assert.equal(res.length, PROGRESS_SECTIONS.length, 'missing keys appended');
assert.equal(res.find((x) => x.key === 'goals')!.on, true, 'appended with default');
```

- [ ] **Step 2:** run → fails. **Step 3:** implement `resolveLayout` (filter saved by registry membership, then append registry keys not present). **Step 4:** check green, commit `feat(progress): section registry and resolveLayout`.
- [ ] **Step 5: Extract sections.** Move each JSX block of `src/app/progress.tsx` into its file verbatim, receiving `SectionProps`; move the block's styles and the local helpers it uses (`fmtTime`, `PERIODS`, the insight-list builder) with it. `volume.tsx` renders the three numbers **in one row** (`flexDirection: 'row'`, `justifyContent: 'space-between'`, number 22pt, unit 12pt, overline 10pt) instead of three tiles. `rating.tsx` becomes per piece: a horizontal chip row of pieces that have ≥ 2 ratings, selected one shows the `Polyline` of `pieceRatings` rolling averages (reuse the existing 12-week polyline code with `rollingAvg` values) and the current rolling average as "★ 4.2". A section returns `null` when it has nothing to show.
- [ ] **Step 6: body.tsx.** Holds `period`, `selDate`, `editing` state, `recapOpen`; computes `sessions`/`pieces` via `useInstrumentFilter`; `const layout = resolveLayout(store.progressLayout)`; renders `header`, then `layout.filter(l => l.on).map(l => { const S = SECTIONS[l.key]; return <S key={l.key} {...props} />; })`, then the existing empty state when `sessions.length === 0 && pieces.length === 0`, then a `Pressable` "Customise" (`progress.customise`) opening `ProgressLayoutSheet` (Task 6; until then a `Sheet` with a plain toggle list is fine — Task 6 replaces it). Also the one-time hint: `store.progressHintSeen` boolean setting (seed `false`), shown as a dismissible line under the header: `progress.customHint` "This tab is yours — switch sections on and off." / "Dieser Tab gehört dir – schalte Bereiche ein und aus."
- [ ] **Step 7:** `src/app/progress.tsx` becomes: header row (ScreenTitle + share button + InstrumentFilter) passed as `header`, `<ProgressBody header={...} />`. Target < 200 lines; run the app (`npx expo start`, press `a` or scan) and eyeball every section still renders as before with the default layout showing four.
- [ ] **Step 8:** `npm run check && npm run check:i18n && npx expo lint`. Commit `refactor(progress): sections as components behind a registry`.

### Task 5: movement-math + the five new sections

**Files:**
- Modify: `src/lib/movement-math.ts`
- Create: `src/components/progress/movement.tsx`, `hear.tsx`, `pipeline.tsx`, `performable.tsx`, `changed.tsx`
- Modify: `src/components/progress/index.ts`, `scripts/check-movement.ts`, locales

**Interfaces:**
```ts
export type Movement =
  | { kind: 'stage'; from: number; to: number }
  | { kind: 'tempo'; deltaBpm: number }
  | { kind: 'rating'; delta: number }
  | { kind: 'stalled'; days: number }
  | { kind: 'due'; days: number }
  | { kind: 'new' };
export type PieceMove = { piece: Piece; move: Movement; minutes: number; spark: number[]; target?: number; ratingFrom?: number; ratingTo?: number; calibration: Calibration | null };
export function pieceMovement(piece: Piece, sessions: Session[], todayKey: string, stagesCount: number, windowDays = 30): PieceMove;
export function rankMovement(list: PieceMove[]): PieceMove[];
export function pipelineCounts(pieces: Piece[], stagesCount: number, todayKey: string): { perStage: number[]; readyThisMonth: number; readyLastMonth: number };
export function freshness(lastPlayedKey: string | null, todayKey: string): number;   // 1 at 0 days → 0 at ≥ 30
export function lastPlayed(piece: Piece, sessions: Session[]): string | null;
export type MonthDiff = { pieces: [number, number]; promoted: [number, number]; hours: [number, number]; bpm: [number, number]; stars: [number | null, number | null] };
export function monthDiff(pieces: Piece[], sessions: Session[], todayKey: string): MonthDiff;  // [thisMonthToDate, lastMonthSamePeriod]
export function recordingPair(recs: Recording[]): [Recording, Recording] | null;  // starred first/last win, else oldest+newest; null if < 2
```

- [ ] **Step 1: Failing check** — extend `scripts/check-movement.ts`:

```ts
import { freshness, monthDiff, pieceMovement, pipelineCounts, rankMovement, recordingPair } from '../src/lib/movement-math.ts';
const today = '2026-09-14';
const S = (title: string, date: string, min = 20, rating?: number) => ({ id: date + title, title, meta: '', min, date, rating });
const P = (name: string, extra: Partial<any> = {}) => ({ id: name, name, by: '', stage: 0, pct: 0, ...extra });
const stages = 3;

const stageUp = P('A', { stage: 1, stageLog: [{ date: '2026-08-01', stage: 0 }, { date: '2026-09-01', stage: 1 }] });
assert.deepEqual(pieceMovement(stageUp, [S('A', '2026-09-10')], today, stages).move, { kind: 'stage', from: 0, to: 1 });
const tempoUp = P('B', { tempoLog: [{ date: '2026-08-20', bpm: 100 }, { date: '2026-09-10', bpm: 112 }] });
assert.deepEqual(pieceMovement(tempoUp, [S('B', '2026-09-10')], today, stages).move, { kind: 'tempo', deltaBpm: 12 });
const ratingUp = P('C');
const cs = [S('C', '2026-08-01', 20, 2), S('C', '2026-08-05', 20, 2), S('C', '2026-09-01', 20, 4), S('C', '2026-09-08', 20, 4), S('C', '2026-09-12', 20, 5)];
assert.equal(pieceMovement(ratingUp, cs, today, stages).move.kind, 'rating');
assert.deepEqual(pieceMovement(P('D'), [S('D', '2026-08-20')], today, stages).move, { kind: 'stalled', days: 25 });
assert.deepEqual(pieceMovement(P('E', { stage: 2 }), [S('E', '2026-08-20')], today, stages).move, { kind: 'due', days: 25 }, 'ready + unplayed 21d beats stalled');
assert.deepEqual(pieceMovement(P('F'), [], today, stages).move, { kind: 'new' });
assert.equal(pieceMovement(tempoUp, [S('B', '2026-09-10', 35), S('B', '2026-07-01', 99)], today, stages).minutes, 35, 'minutes inside window only');

const ranked = rankMovement([pieceMovement(P('F'), [], today, stages), pieceMovement(P('D'), [S('D', '2026-08-20')], today, stages), pieceMovement(tempoUp, [S('B', '2026-09-10')], today, stages), pieceMovement(stageUp, [S('A', '2026-09-10')], today, stages)]);
assert.deepEqual(ranked.map((m) => m.piece.name), ['A', 'B', 'D', 'F']);

const pc = pipelineCounts([stageUp, P('G', { stage: 2, stageLog: [{ date: '2026-09-03', stage: 2 }] }), P('H', { stage: 2, stageLog: [{ date: '2026-08-15', stage: 2 }] })], stages, today);
assert.deepEqual(pc, { perStage: [0, 1, 2], readyThisMonth: 1, readyLastMonth: 1 });

assert.equal(freshness(today, today), 1);
assert.equal(freshness('2026-08-15', today), 0);
assert.ok(Math.abs(freshness('2026-08-30', today) - 0.5) < 0.01);
assert.equal(freshness(null, today), 0);

const md = monthDiff([P('A', { addedAt: Date.parse('2026-09-02T00:00:00Z') })], [S('A', '2026-09-03', 60, 4), S('A', '2026-08-03', 30, 3)], today);
assert.deepEqual(md.pieces, [1, 0]); assert.deepEqual(md.hours, [1, 0.5]); assert.deepEqual(md.stars, [4, 3]);

const R = (id: string, date: string, starred?: boolean) => ({ id, piece: 'A', date, uri: '', sec: 10, starred });
assert.equal(recordingPair([R('1', '2026-01-01')]), null);
assert.deepEqual(recordingPair([R('2', '2026-02-01'), R('1', '2026-01-01'), R('3', '2026-03-01')])!.map((r) => r.id), ['1', '3']);
assert.deepEqual(recordingPair([R('1', '2026-01-01'), R('2', '2026-02-01', true), R('3', '2026-03-01')])!.map((r) => r.id), ['1', '2'], 'a starred newer one wins the "latest" slot');
```

- [ ] **Step 2:** run → fails. **Step 3:** implement. Rules (first match wins): stage entry in window with `stage > previous` → stage; tempo delta in window ≥ 3 → tempo; `ratingTrend(…, windowDays)` delta ≥ 0.5 → rating; last session ≥ 21 days ago and `stage === stagesCount - 1` → due; last session ≥ 14 days ago (or never but has sessions before window) → stalled; else new. `spark` = daily bpm from `tempoLog` within window (empty when no log). `rankMovement`: order kinds stage, tempo, rating, stalled, due, new; within stage by `to - from`, tempo by `deltaBpm`, rating by `delta`, stalled/due by `days` desc.
- [ ] **Step 4: Components.**
  - `movement.tsx`: `Card` titled `progress.moving` ("Moving" / "In Bewegung"); rows for `rankMovement(pieces.map(...)).slice(0, 5)`; row = name (bodyMed 15), stage dots (`stagesCount` small circles, filled up to `stage`), `MiniTrend values={spark} mean={spark.map(() => target ?? null)}` when spark.length ≥ 2, `★ from → to` when both defined, chip text via keys `progress.moveStage` "stage %{from} → %{to}", `progress.moveTempo` "+%{n} BPM", `progress.moveRating` "+%{n} ★", `progress.moveStalled` "stalled %{days} d", `progress.moveDue` "due · %{days} d", `progress.moveNew` "new"; calibration line under the row: `progress.calGradingFeel` "Stars rise, tempo doesn't — grading the feeling?", `progress.calNotSpeed` "Tempo is there, stars aren't — it's not speed.", `progress.calHardDays` "Hard-feeling sessions still moved this piece." Footer `progress.allPieces` → `router.push('/repertoire')`. German for all.
  - `hear.tsx`: `progress.hearTitle` "Hear the difference"; for pieces with `recordingPair` ≠ null (max 3) show piece name, then `RecordingsList recordings={[first, last]}` and `progress.hearDays` "%{days} days apart".
  - `pipeline.tsx`: stacked bar (`StackedShares` with one series per stage or a plain row of `View`s with flex = count), stage labels from `store.stages`, line `progress.pipelineReady` "%{n} reached %{stage} this month · %{m} last month".
  - `performable.tsx`: `progress.performable` "Performable today"; pieces at last stage sorted by freshness desc; row name + `Bar pct={freshness*100}` + `progress.lastPlayed` "%{days} d ago" / "never".
  - `changed.tsx`: `progress.sinceLastMonth`; five rows `label  value (±delta)` for pieces, promoted, hours (1 decimal), BPM, stars (1 decimal or —).
- [ ] **Step 5:** register all five in `SECTIONS`; `npm run check && npm run check:i18n`; run the app, screenshot the tab with all sections on into `var/screenshots/progress-all.png` (Android emulator via `adb exec-out screencap -p > …`). Commit `feat(progress): movement, hear, pipeline, performable and month-diff sections`.

### Task 6: layout sheet with drag + Settings row

**Files:**
- Create: `src/components/progress-layout-sheet.tsx`
- Modify: `src/components/progress/body.tsx` (use it; header sliders icon), `src/components/icons.tsx` (`SlidersIcon`), `src/app/profile.tsx` (row "Progress sections" → opens the same sheet; **delete the two stat Cards at L293–L307 and their styles**), locales

**Interfaces:** `export function ProgressLayoutSheet({ visible, onClose }: { visible: boolean; onClose: () => void })` — reads/writes `store.progressLayout` via `store.updateSettings({ progressLayout })`.

- [ ] **Step 1:** Build the sheet: `Sheet` with a header (`settings.progressSections` "Progress sections" / "Fortschritts-Bereiche"), a list from `resolveLayout(store.progressLayout)`; each row: drag handle (three lines), label `progress.section.<key>`, one-line description `progress.sectionDesc.<key>`, `Switch`. Drag: `GestureDetector` + `Gesture.Pan()` on the handle, `useSharedValue` for the active row's translateY, on end compute the new index by `Math.round(translateY / ROW_H)` and reorder with a plain array move, then `updateSettings`. **Fallback allowed by spec:** if the pan fights the sheet's ScrollView after one honest attempt, ship `▲ ▼` buttons instead and note it in the commit body. Bottom: `settings.resetDefault` "Reset to default" → `updateSettings({ progressLayout: [] })`.
- [ ] **Step 2:** Profile: replace the two stat cards with nothing (the numbers now live in the `volume` section); add row `{ key: 'progressSections', label: store.t('settings.progressSections'), value: store.t('settings.nOfM', { n: on, m: total }) }` opening the sheet. Keys `settings.nOfM` "%{n} of %{m}" / "%{n} von %{m}". Remove `settings.totalPractice`, `settings.bestStreak`, `settings.hrsUnit`, `settings.daysUnit` **only if** `grep -rn` shows no other use.
- [ ] **Step 3:** checks + lint green; manual: toggle, reorder, reset, reopen app and layout persists. Commit `feat(progress): layout sheet — switch and reorder sections; drop settings stat boxes`.

---

# Part 3 — Tab restructure and Tools

### Task 7: Home absorbs Progress; Settings becomes a gear

**Files:**
- Modify: `src/app/_layout.tsx` (tabs: index, practice, repertoire, tools; `progress` and `profile` → `href: null`)
- Modify: `src/app/index.tsx` (header row with greeting left, `GearIcon` Pressable right → `/profile`; keep today card, primary button, quick log, first-session guide; then `<ProgressBody header={<InstrumentFilter/> + share button} />`)
- Modify: locales for any copy that says "Settings tab" (`grep -rn "Settings" src/locales/*.json`, and `home.guide*`)

- [ ] **Step 1:** Edit `_layout.tsx`: remove the `progress` and `profile` visible `Tabs.Screen` entries, add `<Tabs.Screen name="tools" options={{ title: t('tabs.tools'), tabBarIcon: … MetronomeIcon }} />`, add `<Tabs.Screen name="progress" options={{ href: null }} />`, `<Tabs.Screen name="profile" options={{ href: null }} />`, `metronome` and `drone` `href: null` (Task 8 creates them; add entries in Task 8). Key `tabs.tools` "Tools" / "Werkzeuge".
- [ ] **Step 2:** Home: wrap greeting in a row with a `Pressable hitSlop={10}` gear at the right, `accessibilityLabel={store.t('tabs.settings')}`. Below quick log render `ProgressBody`. Remove Home's own `ScrollView` if `ProgressBody` supplies one — exactly one ScrollView on the screen. The first-session guide stays above the body while `store.sessions.length === 0`.
- [ ] **Step 3:** run app: four tabs, gear opens Settings, back returns to Home, deep link `/progress` still renders. Fix `home.guide1Pre`-style copy if it mentions the Settings tab. Commit `feat(nav): four tabs — progress lives on Home, settings behind a gear`.

### Task 8: Tools tab, full-screen metronome, drone

**Files:**
- Create: `src/app/tools.tsx`, `src/app/metronome.tsx`, `src/app/drone.tsx`, `src/lib/drone.ts`, `scripts/check-drone.ts`, `scripts/make-drone.py` (or `.ts` following the existing audio generator in `scripts/`), `assets/audio/drone_<note>.wav` (12 files, A3–G#4 range, 2 s seamless sine+2 soft harmonics, 22 050 Hz mono 16-bit)
- Modify: `src/app/_layout.tsx` (`metronome`, `drone` hidden routes), `src/lib/sounds.ts` or a new tiny player in `drone.tsx` using `expo-audio` `useAudioPlayer` with `loop = true`, locales, `package.json` (`check:drone`)

**Interfaces:**
```ts
// src/lib/drone.ts
export const DRONE_NOTES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
export type DroneNote = (typeof DRONE_NOTES)[number];
export function droneFreq(note: DroneNote, octave: number, a4 = 440): number;   // A4 = 440, C4 = 261.63
export function droneAsset(note: DroneNote): number;  // require('assets/audio/drone_<safe>.wav'), '#' → 's'
```

- [ ] **Step 1: Failing check**

```ts
// scripts/check-drone.ts
import assert from 'node:assert';
import { droneFreq } from '../src/lib/drone.ts';
assert.equal(droneFreq('A', 4), 440);
assert.ok(Math.abs(droneFreq('C', 4) - 261.63) < 0.01);
assert.equal(droneFreq('A', 3), 220);
assert.ok(Math.abs(droneFreq('A', 4, 442) - 442) < 1e-9);
console.log('check-drone ok');
```

- [ ] **Step 2:** run → fails. **Step 3:** implement `droneFreq = a4 * 2 ** ((semitoneFromA(note) + (octave - 4) * 12) / 12)`. Keep `droneAsset` out of the check (it needs Metro's `require`).
- [ ] **Step 4:** Generator script writes the 12 files (one octave A3..G#4 is enough; the octave picker in the UI is ± via `setRate`? — **no**, `expo-audio` rate changes pitch on Android only with `shouldCorrectPitch=false`; verify in the v57 docs. If rate-based octave shift is unreliable, ship a single octave and hide the octave picker). Files must be < 100 KB each; total < 1.2 MB.
- [ ] **Step 5:** `drone.tsx`: 12-note grid, the active note highlighted in accent, big frequency readout, A4 reference stepper 438–446 (persist as `droneA4` setting, seed 440), play/stop. Uses `useAudioPlayer(droneAsset(note))` with `player.loop = true`. Stop on unmount.
- [ ] **Step 6:** `metronome.tsx`: full-screen page reusing `useMetronome()` and the sheet's controls; do this by extracting the sheet's body into `MetronomeControls({ large?: boolean })` inside `src/components/metronome.tsx` and rendering it in both the sheet and the page; add a **tap tempo** button: average of the last 4 tap intervals → `setBpm`. Keep `check:metronome` green.
- [ ] **Step 7:** `tools.tsx`: `ScreenTitle` `tabs.tools`; three `Card` tiles (icon, title, one-line blurb, chevron) → `/metronome`, `/tuner`, `/drone`. Keys `tools.metronome`, `tools.metronomeBlurb` "Click, ramp, subdivide", `tools.tuner`, `tools.tunerBlurb` "Chromatic, cents readout", `tools.drone`, `tools.droneBlurb` "A steady pitch to play against" (+ German).
- [ ] **Step 8:** `npm run check && npm run check:i18n && npx expo lint`; run the app: Tools → each tile → back. Screenshots `var/screenshots/tools.png`, `metronome-page.png`, `drone.png`. Commit `feat(tools): Tools tab with full-screen metronome, tuner and drone`.

### Task 9: Docs, changelog, versionCode, build

- [ ] `CHANGELOG.md` under Unreleased: the three parts in three bullets. `docs/how-etude-is-built.md` architecture block: add `src/components/progress/`. `README.md` feature list if it enumerates tabs.
- [ ] `app.json` `android.versionCode` → 7.
- [ ] `npx expo-doctor && npm run check && npm run check:i18n && npm run check:secrets` green.
- [ ] Commit `chore(release): docs and versionCode 7 for the progress/tools preview`.
- [ ] `npx eas-cli build --platform android --profile preview --non-interactive --no-wait`, poll `build:view <id>` until `finished`, report the `Application Archive URL`.

---

## Self-review

- **Spec coverage:** Part 1 → Tasks 1–2 (rating math, target, review marker, per-piece rating section in Task 4). Part 2 → Tasks 3–6 (stage log, registry, extraction, new sections, sheet, visible customise + hint, settings entry, stat boxes removed). Part 3 → Tasks 7–8 (four tabs, gear, Home merge, Tools, metronome page with tap tempo, drone). Build → Task 9.
- **Placeholders:** none; the only conditional is the documented drag→arrows fallback and the octave-shift verification, both decided by a stated test.
- **Type consistency:** `SectionKey`, `LayoutItem`, `SectionProps`, `PieceMove`, `StageEntry`, `RatingEntry`, `Calibration` are defined once (Tasks 1, 3, 4, 5) and used by name afterwards. `deadlineStatus` gains `lagging`; callers in Task 5 do not depend on it.
