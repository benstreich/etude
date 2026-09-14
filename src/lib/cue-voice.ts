// Which timbre the session-complete cue speaks in (#53). Same motif every time
// — the rising fourth from docs/audio-identity.md — only the voice changes, so
// the app still sounds like itself whatever you play.
//
// ponytail: keyword rules, first match wins, most specific first. ~90
// instruments, four samples; anything unmatched keeps the original mallet.
export type CueVoice = 'mallet' | 'pluck' | 'bow' | 'perc';

const RULES: [string, CueVoice][] = [
  // the "bass" names have to be settled before the bare keywords below
  ['bass guitar', 'pluck'],
  ['electric bass', 'pluck'],
  ['bass clarinet', 'bow'],
  ['double bass', 'bow'],
  // struck and shaken
  ['drum', 'perc'],
  ['percussion', 'perc'],
  ['tabla', 'perc'],
  ['conga', 'perc'],
  ['bongo', 'perc'],
  ['cajón', 'perc'],
  ['cajon', 'perc'],
  ['bodhrán', 'perc'],
  ['bodhran', 'perc'],
  ['timpani', 'perc'],
  ['tambourine', 'perc'],
  ['cymbal', 'perc'],
  ['gong', 'perc'],
  // plucked strings
  ['guitar', 'pluck'],
  ['bass', 'pluck'],
  ['harpsichord', 'pluck'],
  ['harp', 'pluck'],
  ['ukulele', 'pluck'],
  ['banjo', 'pluck'],
  ['mandolin', 'pluck'],
  ['lute', 'pluck'],
  ['sitar', 'pluck'],
  ['sarod', 'pluck'],
  ['pipa', 'pluck'],
  ['koto', 'pluck'],
  ['shamisen', 'pluck'],
  ['balalaika', 'pluck'],
  ['bouzouki', 'pluck'],
  ['charango', 'pluck'],
  ['oud', 'pluck'],
  ['kora', 'pluck'],
  ['zither', 'pluck'],
  ['dulcimer', 'pluck'],
  ['kantele', 'pluck'],
  ['guzheng', 'pluck'],
  ['lyre', 'pluck'],
  ['kalimba', 'pluck'],
  // bowed, blown and sung — anything that can hold a note
  ['violin', 'bow'],
  ['viola', 'bow'],
  ['cello', 'bow'],
  ['violoncello', 'bow'],
  ['fiddle', 'bow'],
  ['erhu', 'bow'],
  ['hurdy-gurdy', 'bow'],
  ['flute', 'bow'],
  ['piccolo', 'bow'],
  ['clarinet', 'bow'],
  ['oboe', 'bow'],
  ['bassoon', 'bow'],
  ['saxophone', 'bow'],
  ['recorder', 'bow'],
  ['whistle', 'bow'],
  ['shakuhachi', 'bow'],
  ['ocarina', 'bow'],
  ['melodica', 'bow'],
  ['harmonica', 'bow'],
  ['bagpipes', 'bow'],
  ['didgeridoo', 'bow'],
  ['trumpet', 'bow'],
  ['trombone', 'bow'],
  ['tuba', 'bow'],
  ['horn', 'bow'],
  ['cornet', 'bow'],
  ['euphonium', 'bow'],
  ['flugelhorn', 'bow'],
  ['accordion', 'bow'],
  ['concertina', 'bow'],
  ['bandoneon', 'bow'],
  ['harmonium', 'bow'],
  ['organ', 'bow'],
  ['theremin', 'bow'],
  ['voice', 'bow'],
];

/** Instrument name (the English persisted value) → cue voice. */
export function cueVoice(instrument: string | undefined): CueVoice {
  const v = (instrument ?? '').toLowerCase();
  if (!v) return 'mallet';
  return RULES.find(([k]) => v.includes(k))?.[1] ?? 'mallet';
}

/** The instrument the cue speaks as: the chosen one, or the first still in the list. */
export function primaryOf(instruments: string[], primary: string): string {
  return instruments.includes(primary) ? primary : (instruments[0] ?? '');
}
