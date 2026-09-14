/** What the lock-screen / notification buttons mean. The step size is the caller's business. */
export type MetronomeCommand = 'inc' | 'dec' | 'toggle';

export type MetronomeControlsEvents = {
  onCommand: (event: { command: MetronomeCommand }) => void;
};

export type MetronomeControlsState = {
  /** Shown as the title, e.g. "96 BPM". */
  bpm: number;
  /** Whether the transport should render as playing. */
  running: boolean;
  /** Second line — the piece being practiced, when there is one. */
  subtitle?: string;
};

/** Config for the native background click loop (Android only). */
export type MetronomeTick = {
  bpm: number;
  /** Level per beat of one bar: 0 = muted, 1 = plain, 2 = group start, 3 = downbeat. */
  pattern: number[];
  /** Clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths. */
  subdiv: number;
  /** Sample set id — the service loads `<sound>_beat|mid|accent|sub` from res/raw. */
  sound: string;
  /** 0-100. */
  volume: number;
};
