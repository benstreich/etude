// Axis math for the minutes chart (components/progress/minutes-chart.tsx),
// kept out of the component so check-chart can gate it.

/** x labels, first and last included */
export const CHART_TICKS = 5;

/** Round the top of the axis up to a value the eye can divide: tens of minutes, then whole hours. */
export const niceMax = (max: number) => (max <= 120 ? Math.max(10, Math.ceil(max / 10) * 10) : Math.ceil(max / 60) * 60);

/** "45m", "1h", "1.5h" — short enough for a 34-point gutter. */
export const fmtAxis = (min: number) => (min < 60 ? `${min}m` : min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);

/** Indices of the x labels: every day of a week, otherwise first, last and evenly spaced between. */
export const tickIndices = (n: number) => {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: CHART_TICKS }, (_, i) => Math.round((i * (n - 1)) / (CHART_TICKS - 1)));
};
