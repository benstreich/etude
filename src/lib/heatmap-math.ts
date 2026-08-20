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
