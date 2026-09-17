import type { Piece, Session } from '@/lib/store';

/** What every progress section receives. Filtering (instrument, archived) is done once in ProgressBody. */
export type SectionProps = {
  sessions: Session[]; // instrument-filtered, all time
  pieces: Piece[]; // instrument-filtered, archived excluded
  mbd: Record<string, number>; // minutes by date for the filtered sessions
  inst: string; // '' = all instruments
  monday: boolean; // week starts on Monday
  onEditSession: (s: Session) => void;
};
