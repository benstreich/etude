// MusicXML import (#92): a real score, parsed into the compact note model the
// engraver (lib/engrave.ts) can draw. v1 is deliberately narrow — one part, one
// voice, one staff, treble clef, the durations the practice staff already
// writes (eighth … breve, plain or dotted) — and everything it cannot keep is
// *counted*, so the user is told how much was simplified rather than shown a
// score that silently lies. Pure and node-runnable — see scripts/check-musicxml.ts.
//
// The XML itself is read by fast-xml-parser in preserveOrder mode: MusicXML is
// order-sensitive (attributes, notes and backups interleave inside a measure),
// and React Native has no DOMParser.

import { XMLParser, XMLValidator } from 'fast-xml-parser';

// explicit .ts so the node check runner (--experimental-strip-types) can resolve it
import { eighthsOf, NOTE_VALUES } from './melody.ts';

export type Accidental = 'sharp' | 'flat' | 'natural';

export type ScoreNote = {
  /** Diatonic staff step: 0 = E4 (the bottom line), +1 per line or space. Beyond 0..8 means ledger lines. */
  step: number;
  /** The note's own alteration from <alter>: -1 flat, 0 natural, +1 sharp. */
  alter: -1 | 0 | 1;
  midi: number;
  /** Duration in eighths after tie-merging and quantization — always one of WRITABLE_EIGHTHS. */
  eighths: number;
  rest?: boolean;
  dotted?: boolean;
  /** The accidental to print before the head, if any — from <accidental>, or inferred against the key. */
  acc?: Accidental;
};
export type ScoreMeasure = {
  notes: ScoreNote[];
  /** written only on the measure where the meter changes */
  meter?: { n: number; d: number };
  /** key signature in fifths (-7..7), only where it changes */
  key?: number;
};
export type ScorePiece = { title?: string; parts: { measures: ScoreMeasure[] }[]; skipped: number };

/** Thrown for anything that is not usable MusicXML — nothing is stored then. */
export class MusicXmlError extends Error {}

/** The durations the engraver can write, in eighths: eighth, quarter, dotted quarter … breve. */
export const WRITABLE_EIGHTHS = NOTE_VALUES.map(eighthsOf);
const MAX_EIGHTHS = WRITABLE_EIGHTHS[WRITABLE_EIGHTHS.length - 1];

const LETTERS = 'CDEFGAB';
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Staff step for a letter and octave: E4 → 0, C4 → -2, F5 → 8, A5 → 10. */
export function stepFor(letter: string, octave: number): number {
  return (octave - 4) * 7 + LETTERS.indexOf(letter.toUpperCase()) - 2;
}

/** MIDI note number — C4 is 60. Computed on its own so a future analysis needs no staff maths. */
export function midiFor(letter: string, octave: number, alter: number): number {
  return 12 * (octave + 1) + SEMITONES[LETTERS.indexOf(letter.toUpperCase())] + alter;
}

/** What the key signature does to a letter: +1 in a sharp key that sharpens it, -1 in a flat key, else 0. */
export function keyAlteration(fifths: number, letter: string): -1 | 0 | 1 {
  const l = letter.toUpperCase();
  if (fifths > 0 && SHARP_ORDER.slice(0, Math.min(7, fifths)).includes(l)) return 1;
  if (fifths < 0 && FLAT_ORDER.slice(0, Math.min(7, -fifths)).includes(l)) return -1;
  return 0;
}

/**
 * Snap a duration in eighths to the nearest one the engraver writes. `exact` is
 * false when something had to give — a sixteenth, a triplet, a tie longer than
 * a breve — which the caller counts as a simplification.
 */
export function quantizeEighths(raw: number): { eighths: number; exact: boolean } {
  if (!Number.isFinite(raw) || raw <= 0) return { eighths: WRITABLE_EIGHTHS[0], exact: false };
  let best = WRITABLE_EIGHTHS[0];
  for (const e of WRITABLE_EIGHTHS) if (Math.abs(e - raw) < Math.abs(best - raw)) best = e;
  return { eighths: best, exact: Math.abs(best - raw) < 1e-6 && raw <= MAX_EIGHTHS };
}

/** Whether a value is written with a dot — the dotted entries of the table. */
export const isDotted = (eighths: number) => NOTE_VALUES.some((v) => eighthsOf(v) === eighths && v.dotted);

/** A compressed .mxl is a zip: by extension, or by the 'PK' magic at the head of the bytes. */
export function isCompressedMusicXml(name: string | undefined, head: string): boolean {
  return /\.mxl$/i.test(name ?? '') || head.startsWith('PK');
}

// --- the XML tree, as fast-xml-parser hands it over in preserveOrder mode ------
// Each node is `{ <tag>: children[], ':@'?: attributes }`; text is `{ '#text': string }`.
type Node = Record<string, unknown>;

const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kidsOf = (n: Node): Node[] => {
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as Node[]) : [];
};
const textOf = (n: Node | undefined): string =>
  n
    ? kidsOf(n)
        .map((k) => ('#text' in k ? String(k['#text']) : ''))
        .join('')
        .trim()
    : '';
const attrOf = (n: Node, name: string): string | undefined => {
  const a = n[':@'] as Record<string, unknown> | undefined;
  return a && a[name] !== undefined ? String(a[name]) : undefined;
};
const child = (n: Node, tag: string) => kidsOf(n).find((k) => tagOf(k) === tag);
const children = (n: Node, tag: string) => kidsOf(n).filter((k) => tagOf(k) === tag);
const has = (n: Node, tag: string) => kidsOf(n).some((k) => tagOf(k) === tag);
const num = (s: string | undefined) => (s === undefined || s === '' ? Number.NaN : Number(s));

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

/**
 * Parse an uncompressed MusicXML document (score-partwise). Throws MusicXmlError
 * on malformed XML, a timewise score, or a score with no part or no measures.
 */
export function parseMusicXml(xml: string): ScorePiece {
  const src = xml.replace(/^﻿/, '');
  if (!src.trim()) throw new MusicXmlError('empty');
  if (src.startsWith('PK')) throw new MusicXmlError('compressed');
  if (XMLValidator.validate(src) !== true) throw new MusicXmlError('malformed');
  let tree: Node[];
  try {
    tree = parser.parse(src) as Node[];
  } catch {
    throw new MusicXmlError('malformed');
  }
  const root = tree.find((n) => tagOf(n) === 'score-partwise');
  if (!root) {
    if (tree.some((n) => tagOf(n) === 'score-timewise')) throw new MusicXmlError('timewise');
    throw new MusicXmlError('not-musicxml');
  }

  const title = textOf(child(child(root, 'work') ?? {}, 'work-title')) || textOf(child(root, 'movement-title')) || undefined;
  const part = child(root, 'part');
  if (!part) throw new MusicXmlError('no-part');
  const measureNodes = children(part, 'measure');
  if (!measureNodes.length) throw new MusicXmlError('no-measures');

  let skipped = 0;
  let divisions = 1;
  let key: number | null = null;
  let meter: { n: number; d: number } | null = null;
  let voice: string | null = null;
  let staff: string | null = null;
  let inTuplet = false;
  // the note a tie is still running into, with its raw (unquantized) length
  let tied: { note: ScoreNote; raw: number; midi: number } | null = null;
  const raws = new Map<ScoreNote, number>();

  const measures: ScoreMeasure[] = measureNodes.map((mNode) => {
    const m: ScoreMeasure = { notes: [] };
    // accidentals carry through the bar: letter+octave → the alteration last written
    const carried = new Map<number, number>();
    let last: ScoreNote | null = null; // the last note kept in this measure, for <chord/>
    for (const el of kidsOf(mNode)) {
      const tag = tagOf(el);
      if (tag === 'attributes') {
        const div = num(textOf(child(el, 'divisions')));
        if (div > 0) divisions = div;
        const fifths = num(textOf(child(child(el, 'key') ?? {}, 'fifths')));
        if (Number.isFinite(fifths) && fifths !== key) {
          key = Math.max(-7, Math.min(7, Math.round(fifths)));
          m.key = key;
        }
        const time = child(el, 'time');
        if (time) {
          const n = num(textOf(child(time, 'beats')));
          const d = num(textOf(child(time, 'beat-type')));
          if (n > 0 && d > 0 && (!meter || meter.n !== n || meter.d !== d)) {
            meter = { n, d };
            m.meter = meter;
          }
        }
        for (const clef of children(el, 'clef')) {
          const sign = textOf(child(clef, 'sign'));
          const line = textOf(child(clef, 'line')) || '2';
          if (!(sign === 'G' && line === '2')) skipped += 1;
        }
        continue;
      }
      if (tag !== 'note') continue; // <backup>, <forward>, <direction>, <barline>, … — cursor moves and markings we do not draw

      if (has(el, 'grace')) {
        skipped += 1;
        continue;
      }
      const v = textOf(child(el, 'voice'));
      if (v) {
        if (voice === null) voice = v;
        else if (v !== voice) {
          skipped += 1;
          continue;
        }
      }
      const st = textOf(child(el, 'staff'));
      if (st) {
        if (staff === null) staff = st;
        else if (st !== staff) {
          skipped += 1;
          continue;
        }
      }

      const rest = has(el, 'rest');
      const pitch = child(el, 'pitch');
      let step = 0;
      let alter: -1 | 0 | 1 = 0;
      let midi = 0;
      let letter = '';
      if (!rest) {
        if (!pitch) {
          skipped += 1; // an unpitched note (percussion) has no place on this staff
          continue;
        }
        letter = textOf(child(pitch, 'step')).toUpperCase();
        const octave = num(textOf(child(pitch, 'octave')));
        const rawAlter = num(textOf(child(pitch, 'alter')));
        if (!LETTERS.includes(letter) || letter.length !== 1 || !Number.isFinite(octave)) {
          skipped += 1;
          continue;
        }
        const a = Number.isFinite(rawAlter) ? Math.round(rawAlter) : 0;
        if (a < -1 || a > 1) skipped += 1; // double sharps and flats are clamped — they cannot be drawn
        alter = Math.max(-1, Math.min(1, a)) as -1 | 0 | 1;
        step = stepFor(letter, octave);
        midi = midiFor(letter, octave, alter);
      }

      // a chord keeps its top note only
      if (has(el, 'chord')) {
        skipped += 1;
        if (last && !last.rest && !rest && midi > last.midi) {
          last.step = step;
          last.alter = alter;
          last.midi = midi;
          last.acc = accidentalFor(el, alter, letter, step, key ?? 0, carried);
        }
        continue;
      }

      const raw = (num(textOf(child(el, 'duration'))) * 2) / divisions;

      if (has(el, 'time-modification')) {
        if (!inTuplet) skipped += 1;
        inTuplet = true;
      } else inTuplet = false;

      const ties = children(el, 'tie').map((t) => attrOf(t, 'type'));
      const tieStop = ties.includes('stop');
      const tieStart = ties.includes('start');

      // the second half of a tie lengthens the first; it is not a note of its own
      if (tieStop && tied && !rest && tied.midi === midi) {
        tied.raw += raw;
        raws.set(tied.note, tied.raw);
        if (!tieStart) tied = null;
        continue;
      }

      const note: ScoreNote = rest ? { step: 0, alter: 0, midi: 0, eighths: 0, rest: true } : { step, alter, midi, eighths: 0 };
      if (!rest) {
        const acc = accidentalFor(el, alter, letter, step, key ?? 0, carried);
        if (acc) note.acc = acc;
      }
      raws.set(note, raw);
      m.notes.push(note);
      last = note;
      tied = tieStart && !rest ? { note, raw, midi } : null;
    }
    return m;
  });

  // quantize once, after ties have been merged
  for (const m of measures) {
    m.notes = m.notes.filter((n) => {
      const raw = raws.get(n) ?? 0;
      if (!(raw > 0)) {
        skipped += 1;
        return false;
      }
      const q = quantizeEighths(raw);
      if (!q.exact) skipped += 1;
      n.eighths = q.eighths;
      if (isDotted(q.eighths)) n.dotted = true;
      return true;
    });
  }

  return { ...(title ? { title } : {}), parts: [{ measures }], skipped };
}

/**
 * The accidental to print: what <accidental> says when it is there, otherwise
 * inferred — an alteration the key or an earlier note in the bar does not
 * already imply gets a sign, and a return to the implied pitch gets a natural.
 */
function accidentalFor(el: Node, alter: number, letter: string, step: number, key: number, carried: Map<number, number>): Accidental | undefined {
  const explicit = textOf(child(el, 'accidental'));
  const implied = carried.has(step) ? carried.get(step)! : keyAlteration(key, letter);
  carried.set(step, alter);
  if (explicit) {
    if (explicit === 'sharp' || explicit === 'flat' || explicit === 'natural') return explicit;
    // double sharps, quarter tones and the like — fall through and infer
  }
  if (alter === implied) return undefined;
  return alter > 0 ? 'sharp' : alter < 0 ? 'flat' : 'natural';
}
