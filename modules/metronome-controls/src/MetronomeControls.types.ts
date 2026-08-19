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
