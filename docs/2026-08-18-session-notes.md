# Changes — 2026-08-18

Summary of the UX/feature pass done in this session.

## Practice timer

- Running session screen has a **Discard session** link (under Pause / End & save) that resets the timer without logging.
- Discarding asks for confirmation: native `Alert.alert` on iOS/Android, `window.confirm` on web (Alert is a no-op there).

## Progress tab

- Replaced the hardcoded "Skills" card with **Time by focus**: real minutes per piece/technique aggregated from the session log, sorted, with bars scaled to the top entry (`2h 15m` formatting past an hour). Hidden when no sessions exist.
- Added an **All time** stat card (total hours) next to This week / Avg per day.
- The **Last 7 days bars are tappable**: selecting a bar highlights it (others dim) and shows that day's total plus each session logged that day. Days with minutes but no session records say "No session details for this day".
- `store.week` entries now carry their `date` key to support this.

## Quick log (Home)

- New setting **`quickLogFocus`** (persisted): quick logs can count toward a specific piece or technique instead of a generic "Quick log" entry.
  - Editable in Profile ("Quick log counts toward") and via a shortcut on the Home card itself (the accent text opens a picker sheet).
- The quick-log area was consolidated into a **card**: "Quick log" title + focus shortcut header, preset chips below. The custom-minutes inline input was removed from Home.
- **Quick log presets** in Profile can now be extended: a + button adds preset fields (max 5); clearing a field removes that preset on save.

## Log past practice

- Moved from the Home tab to the **Practice tab** (link under "Start session"), extracted into `src/components/log-past.tsx`.
- The 7-day chip row was replaced with a **full month calendar** (built inline, no date-picker dependency): month paging, week start honors the "Week starts on" setting, future days disabled, today selectable.
- **What was practiced** is selectable (multi-select chips over pieces + techniques). Entered minutes are split evenly across selections (first takes the rounding remainder); no selection falls back to a plain quick log.
- Chips render as one horizontal swipe row with a **Show all / Show less** toggle that expands them into a wrapped grid.
- **"Add more after saving" checkbox**: keeps the sheet open with the same day selected, clearing only minutes and chips.
- The sheet is capped at 80% screen height and scrolls internally.

## Cosmetics

- Repertoire search bar restyled as a pill with search icon, subtle shadow, and an × clear button (new `SearchIcon` in `src/components/icons.tsx`).
- Repertoire ⋯ menu glyph vertically centered with the status tag.
- Home: gap between the greeting and the streak pill.
- 7-day chart: today's column shows its day letter (accent-colored) instead of a wrapping "Today" label.
- Tab bar: taller with padding + label line-height so descenders ("Progress", "Repertoire") aren't clipped; respects the bottom safe-area inset.

## Notes / known ceilings

- Repertoire piece ↔ session matching is by title string; renaming a piece orphans its history.
- Past-practice minute split is even; no per-piece amounts in one entry (log twice with "Add more" for that).
- `quickLogFocus` keeps pointing at an archived/removed piece name until changed (logs still work, they just reference the old name).
