// Pure session-edit math for the store, node-runnable. Editing a session's
// minutes must move totalMin and that day's minutesByDate by the same delta —
// these three are the source of every stat, streak, and heatmap cell.

type Sess = { id: string; title: string; meta: string; min: number; date: string; note?: string };
type Totals = { sessions: Sess[]; minutesByDate: Record<string, number>; totalMin: number };

export function applySessionUpdate<S extends Totals>(
  s: S,
  id: string,
  patch: { title?: string; meta?: string; min?: number; note?: string },
): S {
  const sess = s.sessions.find((x) => x.id === id);
  if (!sess) return s;
  const delta = patch.min !== undefined ? patch.min - sess.min : 0;
  return {
    ...s,
    sessions: s.sessions.map((x) =>
      x.id === id ? { ...x, ...patch, note: patch.note !== undefined ? patch.note.trim() || undefined : x.note } : x,
    ),
    totalMin: Math.max(0, s.totalMin + delta),
    minutesByDate:
      delta === 0
        ? s.minutesByDate
        : { ...s.minutesByDate, [sess.date]: Math.max(0, (s.minutesByDate[sess.date] ?? 0) + delta) },
  };
}
