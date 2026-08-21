# Growth Features (#17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issue #17's growth features: session review moment, practice plans (builder + runner), tempo ladder, A/B recording compare, and shareable recap cards.

**Architecture:** All state stays in the single SQLite kv-store blob (`src/lib/store.tsx`), extended with `plans`, per-piece `tempoLog`, and optional `planId` on sessions. Pure derivation logic (achievements, tempo delta, recap stats) lives in node-runnable `src/lib/*-math.ts` modules verified by `scripts/check-growth.ts` (repo's existing check pattern). UI follows existing idioms: `themed()` sheets, `Card`/`Overline`/`Bar`, text glyphs over new icons, bottom-sheet modals.

**Tech Stack:** Expo SDK 57, expo-router, react-native-svg (charts/ring), expo-audio (compare players), react-native-view-shot + expo-sharing (recap cards), expo-haptics (runner advance).

**Spec:** `C:\dev\x\design\design_handoff_growth_features\README.md` (+ the three `.dc.html` references there).

## Global Constraints

- Tokens only, via `themed()` + `src/lib/theme.ts` — never raw hex in components (spec hexes are light-theme references).
- Fonts `F.head`/`F.body*`; cards radius 16 padding 16 with `C.cardBorder`; primary buttons 52/radius 14 `C.accent`; pills radius 999; overlines via `Overline`.
- `useSafeAreaInsets()` for top offsets.
- Respect `reduceMotion` for any animation.
- No chart library — plain Views/react-native-svg.
- **Out of scope:** feature 6 (home/lock-screen widgets) — requires native WidgetKit/Glance targets; app must keep running in Expo Go (product direction). Revisit if a dev-client build pipeline lands.
- New deps allowed: `react-native-view-shot`, `expo-haptics` (both Expo Go compatible, installed via `npx expo install`).
- Verification: `npm run check` (extended with `check:growth`) + `npx tsc --noEmit` + `npx expo lint`.

---

### Task 1: State layer + pure math

**Files:**
- Modify: `src/lib/store.tsx`, `src/lib/migrate.ts`, `src/lib/theme.ts` (add `successTint`)
- Create: `src/lib/growth-math.ts`
- Test: `scripts/check-growth.ts`, wire `check:growth` into `package.json`

**Interfaces (Produces):**
```ts
// store.tsx
export type PlanSegment = { focus: { name: string; kind: 'Piece' | 'Technique' }; note?: string; bpm?: number; min: number };
export type Plan = { id: string; name: string; segments: PlanSegment[] };
export type TempoEntry = { date: string; bpm: number }; // dateKey format, list kept sorted ascending by date
// Piece gains: tempoLog?: TempoEntry[]
// Session gains: planId?: string
// Store gains:
addPlan(name: string): string;             // returns id, seeds one empty 10-min segment? no — empty segments []
updatePlan(id: string, patch: Partial<Pick<Plan, 'name' | 'segments'>>): void;
removePlan(id: string): void;
logTempo(pieceId: string, bpm: number, date?: string): void;   // upserts entry for that date, keeps sort
deleteTempoEntry(pieceId: string, date: string): void;
// logMinutes gains optional planId: logMinutes(min, title, meta, date?, planId?)

// growth-math.ts (pure, node-runnable)
export type Achievement = { kind: 'streak' | 'milestone'; label: string };
export function achievements(opts: { streak: number; sessionCount: number; minutesByDate: Record<string, number>; dailyGoal: number; today: string }): Achievement[];
// priority: streak chip (n>=2) first, then milestones: 'First session' (sessionCount === 1),
// 'Goal hit 7 days straight' (each of last 7 days >= dailyGoal), 'Best week yet'
// (this calendar-agnostic rolling 7-day total ending today is the max over all history windows). Max 2 returned.
export function tempoDelta(log: TempoEntry[], todayKey: string): number; // bpm gained in current month (last entry minus last entry before month start / first entry of month); 0 if flat/none
export function recapStats(opts: { sessions: { title: string; min: number; date: string }[]; minutesByDate: Record<string, number>; breakDays: string[]; year: number; month?: number }): { totalMin: number; daysPracticed: number; longestStreak: number; topPiece: string | null; monthlyMinutes?: number[] };
```

- [x] Steps: add `successTint` to LIGHT (`#EDF3EA`) / DARK (`#1F2E24`); write `growth-math.ts`; extend `Session`/`Piece`/`State` types + seed (`plans: []`); store actions above; migrate: ensure `plans` array default. Write `scripts/check-growth.ts` asserting achievements priority/max-2, tempoDelta month math, recapStats streak/topPiece; run `npm run check:growth`; commit.

### Task 2: Session review modal

**Files:**
- Create: `src/components/session-review.tsx`
- Modify: `src/app/practice.tsx` (replace the note prompt modal with the review)

**Interfaces:**
- Consumes: `achievements()` from growth-math; store fields `name, dailyGoal, displayStreak, sessions, minutesByDate, today`.
- Produces: `<SessionReview session={ {id, min, focusName, start, end} | null } onClose={() => void} onAttachTake={() => void} recording={boolean} />` — full-screen `Modal`; "Done" top-right and "Save session" both close (note saved via `store.setSessionNote`).

- [x] Steps: build GoalRing (SVG circles, strokeDasharray; Animated sweep on mount unless `reduceMotion`; overflow past 100% drawn as a second lighter-accent arc); title "Nice work, {name}"; meta "{focus} · {start} – {end}"; max-2 achievement chips (streak chip tinted, milestone outlined); expanding note field; bottom row "Attach take" (outline, toggles the practice recorder which stays mounted) + "Save session" (primary). In `practice.tsx`: `endSave` now opens the review instead of the plain note sheet; keep focus set until review closes. Verify tsc + lint; commit.

### Task 3: Plans — store section + builder

**Files:**
- Create: `src/app/plan/[id].tsx` (builder)
- Modify: `src/app/practice.tsx` (add "Plans" section listing plans + "New plan" row)

- [x] Steps: Practice picker screen gains `Overline "Plans"` section (rows: name + "{n} segments · {sum} min", tap → builder; "+ New plan" creates via `addPlan` and routes). Builder: back nav, editable name (`F.head` 26), meta line, segment cards (title "{focus}{note ? ` · ${note}`}", sub "Metronome {bpm} BPM" if bpm, duration chip → tapping opens edit sheet), reorder via up/down long-press? — ponytail: simple ▲/▼ arrows instead of drag (no gesture lib wiring), "+ Add segment" dashed row, edit sheet (focus picker chips reusing pieces+techniques, note input, bpm input, minute stepper), bottom primary "Start plan" → routes to runner. Commit.

### Task 4: Plan runner

**Files:**
- Create: `src/app/plan/run.tsx` (param `id`)

- [x] Steps: wall-clock timer per segment (same startedAt/accum pattern as practice.tsx); header plan name + "End" (confirm mid-segment); segment progress pills (flex ∝ minutes, done accent / current partial fill / rest track); center overline "SEGMENT {i} OF {n}", segment title, elapsed `F.head` 64, "of {min} min"; metronome chip toggling `useMetronome` with segment bpm; controls pause / "Next" / (skip record button — recorder plumbing lives in practice; note as follow-up). Auto-advance at segment end with `expo-haptics` impact; each segment end logs one session via `logMinutes(min, focus.name, focus.kind, undefined, planId)`; last segment → SessionReview then back. Install expo-haptics. Commit.

### Task 5: Tempo ladder

**Files:**
- Create: `src/components/tempo-ladder.tsx`
- Modify: `src/app/piece/[id].tsx` (card between stats row and recordings)

- [x] Steps: card with overline TEMPO LADDER + "target {bpm} BPM"; hero current bpm (`F.head` 34 accent) + "BPM now"; delta chip `+{n} this month` (successTint/success, hidden ≤0); SVG line chart of tempoLog (stroke accent 2.5, round joins, end dot 4.5 with ring `C.card`, dashed target line, month labels); footer buttons "Log today's tempo" (tint, stepper sheet defaulting to last logged, saves via `logTempo` and mirrors into `piece.currentBpm`) + "Metronome · {bpm}" (`MetronomeButton presetBpm`); recent entries list card (date/bpm rows, Delete action — plain button like recordings, not swipe). Show ladder card only when `tempoLog?.length`; else a ghost "Log today's tempo" row when targetBpm exists. Commit.

### Task 6: A/B compare

**Files:**
- Create: `src/app/compare.tsx` (params: `piece`, `a`, `b` recording ids)
- Modify: `src/app/piece/[id].tsx` (add "Compare" action on recordings header when ≥2)

- [x] Steps: two `useAudioPlayer` instances (A/B) loaded with both takes; segmented flip "Playing A / B" — flipping pauses one, seeks other to same `currentTime` (clamped to its duration), plays; per-take cards (badge A/B, date, dur · bpm meta, play button, waveform bars reusing recording `wave`, elapsed); "Change takes" opens a picker sheet listing the piece's recordings to reassign A/B; caption under flip. Entry: piece detail recordings header row gains "Compare" link (`C.accent`) → routes with two newest takes. Commit.

### Task 7: Shareable recap cards

**Files:**
- Create: `src/components/recap-card.tsx`
- Modify: `src/app/progress.tsx` (header share icon → recap modal)

- [x] Steps: `npx expo install react-native-view-shot`. Modal from Progress header (text glyph share button next to title): segmented Monthly / Year-so-far, card preview rendered at 340×425, `captureRef(ref, { format: 'png', pixelRatio: 1080/340 })` → `expo-sharing.shareAsync`. Monthly: accent bg, fermata glyph + "Étude" cream, "{MONTH} {YEAR}" overline, hero total time + "of practice this month" in `C.logoDot`, footer rows (Days practiced / Longest streak / Top piece / Tempo gained) over 25%-cream hairlines. Year: bg card with border, LogoMark + wordmark, "{YEAR} SO FAR", monthly mini-bars (three accent steps by relative height), hero "{n} hours" + "at the {instrument} since January" (fallback "of practice"), footer rows (Pieces finished / Best month / Longest streak). Rules: max 4 rows, omit empty, no zeros. Data from `recapStats`. Cream = literal `#FAF7F2`/`#E8A87C` on the card only (share image must not follow dark theme — matches LogoMark precedent). Commit.

### Task 8: Verification pass

- [x] `npm run check`, `npx tsc --noEmit`, `npx expo lint`; fix fallout; final commit; update issue #17 comment? (remote-work rule: commit only, no push).
