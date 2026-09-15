import type { FocusPeriod, Piece, Session } from '@/lib/store';

/** What every progress section receives. Filtering (instrument, archived) is done once in ProgressBody. */
export type SectionProps = {
  sessions: Session[]; // instrument-filtered, all time
  inPeriod: Session[]; // the same, cut to the selected period
  pieces: Piece[]; // instrument-filtered, archived excluded
  mbd: Record<string, number>; // minutes by date for the filtered sessions
  inst: string; // '' = all instruments
  monday: boolean; // week starts on Monday
  period: FocusPeriod;
  onEditSession: (s: Session) => void;
};
