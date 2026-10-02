// Which instruments a piece or technique belongs to (#58).
//
// The same piece is often played on more than one instrument, so this is a set,
// not a single tag. An empty set means "every instrument" — that is what an
// untagged technique has always meant, and it stays the default.
//
// `instrument` is the original single-value field. It is still written as the
// first of `instruments` so older data, the CSV export and anything reading one
// tag keep working; `instruments` is the truth when present.
export type Instrumented = { instrument?: string; instruments?: string[] };

/** The instruments a piece belongs to. Empty = every instrument. */
export function pieceInstruments(p: Instrumented): string[] {
  if (p.instruments) return p.instruments;
  return p.instrument ? [p.instrument] : [];
}

/** Does this piece belong under `inst`? '' is the All filter and shows everything. */
export function onInstrument(p: Instrumented, inst: string): boolean {
  if (!inst) return true;
  const list = pieceInstruments(p);
  return list.length === 0 || list.includes(inst);
}

/**
 * The instruments a session has to choose between before its minutes can be filed.
 *
 * A piece played on two instruments cannot be credited to one of them by default:
 * taking the first of the set is a coin toss, and half the time the minutes land on
 * the wrong instrument's total. Only the player knows which one today was.
 *
 * Empty means there is nothing to ask — the tab in view already names an instrument,
 * the piece carries at most one, or it is untagged and so counts under every one.
 */
export function instrumentChoices(p: Instrumented | undefined, filter: string): string[] {
  if (filter) return [];
  const list = p ? pieceInstruments(p) : [];
  return list.length > 1 ? list : [];
}

/**
 * Stored instrument ids stay English; the common eight have translations
 * (settings.inst*), the long tail shows the id itself.
 */
export const INSTRUMENT_KEYS: Record<string, string> = {
  Piano: 'settings.instPiano',
  Guitar: 'settings.instGuitar',
  Violin: 'settings.instViolin',
  Cello: 'settings.instCello',
  Flute: 'settings.instFlute',
  Voice: 'settings.instVoice',
  Drums: 'settings.instDrums',
  Bass: 'settings.instBass',
};

/** Persisted id → label in the current language. */
export const instrumentName = (v: string, t: (key: string) => string) => (INSTRUMENT_KEYS[v] ? t(INSTRUMENT_KEYS[v]) : v);

/** What to print under a row on the All list; empty when the piece is untagged. */
export function instrumentLabel(p: Instrumented, name: (v: string) => string = (v) => v): string {
  return pieceInstruments(p).map(name).join(' · ');
}

/**
 * Add or remove one instrument, as a patch for the store. Removing the last one
 * leaves the set empty, which reads as "every instrument" rather than as orphaned.
 */
export function toggleInstrument(p: Instrumented, inst: string): { instruments: string[]; instrument: string | undefined } {
  const list = pieceInstruments(p);
  const next = list.includes(inst) ? list.filter((i) => i !== inst) : [...list, inst];
  return { instruments: next, instrument: next[0] };
}
