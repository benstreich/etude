/** Snapshot the home/lock-screen widgets render. Written after anything that
 * changes today's numbers; native side persists it (SharedPreferences / App Group). */
export type WidgetData = {
  today: number; // minutes practiced today
  goal: number; // daily goal in minutes
  streak: number; // current display streak (days)
  week: number[]; // last 7 days of minutes, oldest first, today last
  nextFocus: string | null; // suggested next piece/technique, if any
};
