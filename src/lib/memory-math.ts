// Memorization mode (#94): which measures of an imported score to blank for a
// recall test, and what the self-graded log says. Deterministic on purpose —
// the same seed always hides the same bars, so nothing jumps around mid-test,
// the set survives an app restart within the day, and render stays pure under
// the React Compiler (no Math.random). Pure and node-runnable — see
// scripts/check-memory.ts.

export type MemoryFraction = 25 | 50 | 75;
export type MemoryScore = 0 | 1 | 2; // struggled | ok | solid
export const MEMORY_FRACTIONS: MemoryFraction[] = [25, 50, 75];

/** djb2 over the seed string — the same hash lib/melody.ts uses to give a name its pitch. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** mulberry32: a tiny, well-behaved generator over a 32-bit state, [0, 1). */
function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many of `count` measures a fraction hides: rounded, at least one while there is anything to hide. */
export function hiddenCount(count: number, fraction: MemoryFraction): number {
  if (count <= 0) return 0;
  return Math.min(count, Math.max(1, Math.round((count * fraction) / 100)));
}

/**
 * The measure indexes to blank: a partial Fisher–Yates over 0..count-1, driven
 * by the seed, taking the first `hiddenCount` picks — returned ascending so the
 * caller can render in page order.
 */
export function hiddenMeasures(seed: string, count: number, fraction: MemoryFraction): number[] {
  const n = hiddenCount(count, fraction);
  if (n === 0) return [];
  const rand = mulberry32(djb2(seed));
  const pool = Array.from({ length: count }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (count - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

/** The seed for a day's test: the piece, the day, and the reshuffle counter. The fraction is not part of it, so changing it keeps the day's draw. */
export const memorySeed = (pieceId: string, today: string, salt: number) => `${pieceId}|${today}|${salt}`;

/** The most recent entry by date (the last of equal dates wins — entries are appended in order); null for nothing. */
export function lastTest<E extends { date: string; score: MemoryScore }>(log: E[] | undefined): E | null {
  if (!log || !log.length) return null;
  let best = log[0];
  for (const e of log) if (e.date >= best.date) best = e;
  return best;
}

/** The last `n` entries in the order they were logged — the history strip. */
export function recentTests<E extends { date: string }>(log: E[] | undefined, n = 14): E[] {
  if (!log) return [];
  return [...log].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
}
