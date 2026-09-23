/** What the lock-screen / notification buttons mean. The step size is the caller's business. */
export type MetronomeCommand = 'inc' | 'dec' | 'toggle';

/** One tick the native engine has just placed (Android only): the tick played, and the one after it. */
export type MetronomeTickEvent = {
  /** Beat the tick belongs to, counted from the start of the run — not the bar. */
  beat: number;
  /** Position inside that beat: 0 is the beat itself, 1.. a subdivision click. */
  sub: number;
  nextBeat: number;
  nextSub: number;
};

export type MetronomeControlsEvents = {
  onCommand: (event: { command: MetronomeCommand }) => void;
  onTick: (event: MetronomeTickEvent) => void;
};

export type MetronomeControlsState = {
  /** Shown as the title, e.g. "96 BPM". */
  bpm: number;
  /** Whether the transport should render as playing. */
  running: boolean;
  /** Second line — the piece being practiced, when there is one. */
  subtitle?: string;
};

/** One click through the native SoundPool (Android only) — the sound picker's preview. */
export type MetronomeClick = {
  sound: string;
  /** 0 plain, 1 group start, 2 downbeat, 3 subdivision. */
  bank: number;
  /** 0-100. */
  volume: number;
};

/** Config for the native beat engine (Android only). */
export type MetronomeTick = {
  bpm: number;
  /** Level per beat of one bar: 0 = muted, 1 = plain, 2 = group start, 3 = downbeat. */
  pattern: number[];
  /** Clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
  subdiv: number;
  /** Sample set id — the engine decodes `<sound>_beat|mid|accent|sub` from res/raw. */
  sound: string;
  /** 0-100. */
  volume: number;
  /** Beat the first tick belongs to — counted from the start of the run, not the bar. */
  beat?: number;
  /** How far into that beat: 0 is the beat itself. */
  sub?: number;
  /** Milliseconds until the first tick; 0 clicks straight away. */
  startIn?: number;
};
