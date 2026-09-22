// Repertoire folders (#102): the fold into sections, and the two cascades that
// keep `piece.folder` honest when a folder is renamed or dropped.
import assert from 'node:assert';

import {
  groupByFolder,
  MAX_FOLDER_NAME,
  MAX_FOLDERS,
  removeFolderIn,
  renameFolderIn,
  validFolderName,
} from '../src/lib/folder-math.ts';
import type { Piece } from '../src/lib/store';

const piece = (name: string, folder?: string): Piece => ({ id: name, name, by: '', stage: 0, pct: 0, folder });
const names = (ps: Piece[]) => ps.map((p) => p.name);

// --- grouping ---

// no folders: one ungrouped section holding the list untouched, which is what
// makes a library with no folders render exactly as it did before they existed
{
  const ps = [piece('a'), piece('b')];
  assert.deepEqual(groupByFolder(ps, []), [{ folder: null, pieces: ps }]);
}

// sections come back in `folders` order, not in the order pieces mention them,
// and the ungrouped section is always last
{
  const ps = [piece('a', 'Fun'), piece('b', 'Exam'), piece('c'), piece('d', 'Fun')];
  const out = groupByFolder(ps, ['Exam', 'Orchestra', 'Fun']);
  assert.deepEqual(out.map((s) => s.folder), ['Exam', 'Orchestra', 'Fun', null]);
  assert.deepEqual(names(out[0]!.pieces), ['b']);
  assert.deepEqual(names(out[1]!.pieces), [], 'an empty folder is kept, not dropped');
  assert.deepEqual(names(out[2]!.pieces), ['a', 'd'], 'pieces keep their input order');
  assert.deepEqual(names(out[3]!.pieces), ['c']);
}

// a piece naming a folder that is gone falls to ungrouped instead of vanishing
{
  const out = groupByFolder([piece('a', 'Deleted'), piece('b', 'Exam')], ['Exam']);
  assert.deepEqual(out.map((s) => s.folder), ['Exam', null]);
  assert.deepEqual(names(out[1]!.pieces), ['a']);
}

// every piece lands in exactly one section, whatever the input
{
  const ps = [piece('a', 'Exam'), piece('b'), piece('c', 'Gone'), piece('d', 'Fun')];
  const out = groupByFolder(ps, ['Exam', 'Fun']);
  assert.equal(out.reduce((n, s) => n + s.pieces.length, 0), ps.length);
}

// --- name validation ---

assert.equal(validFolderName('Exam', []), 'Exam');
assert.equal(validFolderName('  Exam  ', []), 'Exam', 'stored trimmed');
assert.equal(validFolderName('', []), null);
assert.equal(validFolderName('   ', []), null, 'whitespace is not a name');
assert.equal(validFolderName('x'.repeat(MAX_FOLDER_NAME), []), 'x'.repeat(MAX_FOLDER_NAME));
assert.equal(validFolderName('x'.repeat(MAX_FOLDER_NAME + 1), []), null);
assert.equal(validFolderName('Exam', ['Exam']), null);
assert.equal(validFolderName('exam', ['Exam']), null, 'duplicates are case-insensitive');
assert.equal(validFolderName('EXAM ', ['Exam']), null, 'trim happens before the comparison');
assert.equal(validFolderName('New', Array.from({ length: MAX_FOLDERS }, (_, i) => `f${i}`)), null, 'at the cap');
assert.ok(validFolderName('New', Array.from({ length: MAX_FOLDERS - 1 }, (_, i) => `f${i}`)), 'one under the cap');
// a rename passes the list without the old name, so re-casing the same folder is allowed
assert.equal(validFolderName('EXAM', ['Fun']), 'EXAM');

// --- rename cascade ---

{
  const folders = ['Exam', 'Fun'];
  const ps = [piece('a', 'Exam'), piece('b', 'Fun'), piece('c')];
  const out = renameFolderIn(folders, ps, 'Exam', 'Recital');
  assert.deepEqual(out.folders, ['Recital', 'Fun'], 'the folder keeps its position');
  assert.equal(out.pieces[0]!.folder, 'Recital');
  assert.equal(out.pieces[1]!.folder, 'Fun', 'other folders untouched');
  assert.equal(out.pieces[2]!.folder, undefined, 'ungrouped stays ungrouped');
  assert.deepEqual(folders, ['Exam', 'Fun'], 'inputs are not mutated');
  assert.equal(ps[0]!.folder, 'Exam');
  // and the renamed folder still groups its pieces afterwards
  assert.deepEqual(names(groupByFolder(out.pieces, out.folders)[0]!.pieces), ['a']);
}

// renaming a folder nothing is filed under changes only the list
{
  const out = renameFolderIn(['Exam', 'Fun'], [piece('a', 'Exam')], 'Fun', 'Play');
  assert.deepEqual(out.folders, ['Exam', 'Play']);
  assert.equal(out.pieces[0]!.folder, 'Exam');
}

// --- remove cascade ---

{
  const folders = ['Exam', 'Fun'];
  const ps = [piece('a', 'Exam'), piece('b', 'Fun')];
  const out = removeFolderIn(folders, ps, 'Exam');
  assert.deepEqual(out.folders, ['Fun']);
  assert.equal(out.pieces[0]!.folder, undefined, 'the piece is kept, only the grouping goes');
  assert.equal(out.pieces[1]!.folder, 'Fun');
  assert.equal(out.pieces.length, ps.length, 'removing a folder never removes a piece');
  assert.deepEqual(folders, ['Exam', 'Fun'], 'inputs are not mutated');
  // the cleared piece now groups as ungrouped
  const sections = groupByFolder(out.pieces, out.folders);
  assert.deepEqual(names(sections[sections.length - 1]!.pieces), ['a']);
}

// removing a name that isn't a folder is a no-op, not a crash
{
  const out = removeFolderIn(['Exam'], [piece('a', 'Exam')], 'Nope');
  assert.deepEqual(out.folders, ['Exam']);
  assert.equal(out.pieces[0]!.folder, 'Exam');
}

console.log('folder ok');
