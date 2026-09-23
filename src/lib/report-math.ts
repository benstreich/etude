// Teacher export (#99): everything a practice report says, aggregated from the
// sessions, the day totals and the pieces' tempo logs for one week or month.
// Pure and node-runnable — see scripts/check-report.ts. The report view only
// formats what comes out of here; caps (rows, notes, note length) are enforced
// here so the page can never overflow.
//
// Sessions join pieces by display name (`session.title === piece.name`), the
// app-wide convention; renamePiece rewrites history, so the join holds.

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { periodRange } from './goal-math.ts';
import { addDays } from './rating-math.ts';

export type ReportPeriod = { kind: 'week' | 'month'; anchor: string /* a dateKey inside the period */ };
export type ReportSession = { title: string; min: number; date: string; note?: string; rating?: number; at?: number; spot?: string };
export type ReportPiece = { name: string; tempoLog?: { date: string; bpm: number }[] };

export type ReportRow = {
  name: string;
  min: number;
  sessions: number;
  /** sessions logged against one of the piece's trouble spots (#91) */
  spotSessions: number;
  /** BPM change across the period; null when the tempo log has no entry in it */
  tempoDelta: number | null;
  /** mean of the rated sessions; null when none was rated */
  avgRating: number | null;
};
export type ReportNote = { date: string; at?: number; focus: string; note: string };
export type ReportData = {
  range: { start: string; end: string };
  totalMin: number;
  days: number;
  sessionCount: number;
  /** every day of the range, zeros included */
  perDay: { date: string; min: number }[];
  pieceRows: ReportRow[];
  /** rows past MAX_ROWS, for "and N more" */
  morePieces: number;
  notes: ReportNote[];
  moreNotes: number;
};

/** The page holds this many piece rows and notes; the rest is counted. */
export const MAX_ROWS = 10;
export const MAX_NOTES = 12;
/** A note longer than this is cut with an ellipsis. */
export const NOTE_CHARS = 140;

/** First and last dateKey of the period, inclusive. Weeks follow the week-start setting. */
export function reportRange(period: ReportPeriod, weekStart: 'Monday' | 'Sunday'): { start: string; end: string } {
  const r = periodRange(period.kind, period.anchor, weekStart);
  return { start: r.from, end: r.to };
}

/** Cut at NOTE_CHARS on a word boundary where there is one, with an ellipsis. */
export function clipNote(note: string, max = NOTE_CHARS): string {
  const clean = note.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** BPM change across [start, end]: the last entry in range against the last one before it (or the first in range). */
export function tempoDeltaIn(log: { date: string; bpm: number }[] | undefined, start: string, end: string): number | null {
  if (!log?.length) return null;
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const inRange = sorted.filter((e) => e.date >= start && e.date <= end);
  if (!inRange.length) return null;
  const before = sorted.filter((e) => e.date < start);
  const base = before.length ? before[before.length - 1].bpm : inRange[0].bpm;
  return inRange[inRange.length - 1].bpm - base;
}

/**
 * The report, or null when nothing was practised in the period (the caller
 * disables sharing and says so). `pieceFilter` narrows sessions, days and rows
 * to one piece — the piece page's entry point.
 */
export function reportData(input: {
  sessions: ReportSession[];
  minutesByDate: Record<string, number>;
  pieces: ReportPiece[];
  period: ReportPeriod;
  weekStart: 'Monday' | 'Sunday';
  pieceFilter?: string;
}): ReportData | null {
  const range = reportRange(input.period, input.weekStart);
  const { start, end } = range;
  const sessions = input.sessions
    .filter((s) => s.date >= start && s.date <= end && (!input.pieceFilter || s.title === input.pieceFilter))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? 0) - (b.at ?? 0));

  // day totals: the store's own per-day minutes for the whole log, the piece's sessions when filtered
  const perDay: { date: string; min: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const min = input.pieceFilter ? sessions.filter((s) => s.date === d).reduce((a, s) => a + s.min, 0) : Math.max(0, input.minutesByDate[d] ?? 0);
    perDay.push({ date: d, min });
  }
  const totalMin = perDay.reduce((a, x) => a + x.min, 0);
  if (totalMin <= 0 && sessions.length === 0) return null;

  // per piece, by display name
  const by = new Map<string, { min: number; n: number; spots: number; ratings: number[] }>();
  for (const s of sessions) {
    const row = by.get(s.title) ?? { min: 0, n: 0, spots: 0, ratings: [] };
    row.min += s.min;
    row.n += 1;
    if (s.spot) row.spots += 1;
    if (s.rating && s.rating > 0) row.ratings.push(s.rating);
    by.set(s.title, row);
  }
  const rows: ReportRow[] = [...by.entries()]
    .map(([name, r]) => ({
      name,
      min: r.min,
      sessions: r.n,
      spotSessions: r.spots,
      tempoDelta: tempoDeltaIn(input.pieces.find((p) => p.name === name)?.tempoLog, start, end),
      avgRating: r.ratings.length ? r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length : null,
    }))
    .sort((a, b) => b.min - a.min || a.name.localeCompare(b.name));

  const notes: ReportNote[] = sessions
    .filter((s) => !!s.note?.trim())
    .map((s) => ({ date: s.date, ...(s.at !== undefined ? { at: s.at } : {}), focus: s.title, note: clipNote(s.note!) }));

  return {
    range,
    totalMin,
    days: perDay.filter((x) => x.min > 0).length,
    sessionCount: sessions.length,
    perDay,
    pieceRows: rows.slice(0, MAX_ROWS),
    morePieces: Math.max(0, rows.length - MAX_ROWS),
    notes: notes.slice(0, MAX_NOTES),
    moreNotes: Math.max(0, notes.length - MAX_NOTES),
  };
}
