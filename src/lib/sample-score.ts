// A small MusicXML score of our own (#92): eight bars in G major, written for
// this app so nothing is borrowed. It is what "Try an example" imports on the
// piece page — a way to see the viewer before owning a .musicxml file — and it
// is also the end-to-end test's way past the OS file picker, which Maestro
// cannot drive. Deliberately exercises what the parser handles: a dotted half,
// beamed eighths, a rest, and ledger lines below (C4) and above (A5) the staff.
// A string rather than an asset file so Metro needs no extra extension and the
// node check can parse it (scripts/check-musicxml.ts asserts it imports clean).

const measure = (n: number, body: string, attributes = '') => `<measure number="${n}">${attributes}${body}</measure>`;
const note = (step: string, octave: number, duration: number, type: string, extra = '') =>
  `<note><pitch><step>${step}</step>${step === 'F' ? '<alter>1</alter>' : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type>${extra}</note>`;
const rest = (duration: number, type: string) => `<note><rest/><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;

// divisions = 2: an eighth is 1, a quarter 2, a half 4, a dotted half 6
const e = 1;
const q = 2;
const hd = 6;

export const SAMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>A little minuet</work-title></work>
  <identification><encoding><software>Étude</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    ${measure(
      1,
      note('D', 5, q, 'quarter') + note('G', 5, q, 'quarter') + note('A', 5, q, 'quarter'),
      '<attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>',
    )}
    ${measure(2, note('G', 5, e, 'eighth') + note('F', 5, e, 'eighth') + note('E', 5, q, 'quarter') + note('D', 5, q, 'quarter'))}
    ${measure(3, note('C', 5, q, 'quarter') + note('B', 4, q, 'quarter') + note('A', 4, q, 'quarter'))}
    ${measure(4, note('G', 4, hd, 'half', '<dot/>'))}
    ${measure(5, note('E', 4, q, 'quarter') + note('D', 4, q, 'quarter') + note('C', 4, q, 'quarter'))}
    ${measure(6, note('D', 4, e, 'eighth') + note('E', 4, e, 'eighth') + note('F', 4, q, 'quarter') + note('G', 4, q, 'quarter'))}
    ${measure(7, note('A', 4, q, 'quarter') + rest(q, 'quarter') + note('B', 4, q, 'quarter'))}
    ${measure(8, note('G', 4, hd, 'half', '<dot/>'), '')}
  </part>
</score-partwise>
`;
