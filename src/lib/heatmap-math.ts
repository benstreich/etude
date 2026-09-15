// Pure month-heatmap logic for the Progress screen, node-runnable.

/** Mix two #RRGGBB colors; t=0 → a, t=1 → b. */
export const mix = (a: string, b: string, t: number) => {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const lerp = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return `#${lerp(1)}${lerp(3)}${lerp(5)}`;
};

/** Calendar rows of 7 day-numbers (null = blank), honoring the week-start setting. */
export function monthGrid(year: number, month: number, weekStartsMonday: boolean): (number | null)[][] {
  const start = weekStartsMonday ? 1 : 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() - start + 7) % 7;
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 0 none · 1 light (1–24 min) · 2 mid (25–39) · 3 full (40+). */
export const heatLevel = (min: number) => (min <= 0 ? 0 : min < 25 ? 1 : min < 40 ? 2 : 3);

export type ChartPoint = { label: string; min: number };

/**
 * Minutes over time for the heatmap card's line and bar views, following the
 * period selector: daily points for 7d and 30d, 7-day buckets ending today for
 * all-time (capped at a year so the axis stays readable).
 */
export function chartSeries(mbd: Record<string, number>, today: string, period: '7d' | '30d' | 'all'): ChartPoint[] {
  const day = (offset: number) => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  if (period !== 'all') {
    const n = period === '7d' ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const key = day(i - (n - 1));
      return { label: key, min: mbd[key] ?? 0 };
    });
  }

  const practised = Object.keys(mbd).filter((k) => mbd[k] > 0 && k <= today).sort();
  if (practised.length === 0) return [];
  const span = Math.round((new Date(today + 'T12:00:00').getTime() - new Date(practised[0] + 'T12:00:00').getTime()) / 86_400_000);
  const buckets = Math.min(52, Math.max(1, Math.ceil((span + 1) / 7)));
  return Array.from({ length: buckets }, (_, b) => {
    const end = -(buckets - 1 - b) * 7;
    let min = 0;
    for (let d = 0; d < 7; d++) min += mbd[day(end - d)] ?? 0;
    return { label: day(end - 6), min };
  });
}
