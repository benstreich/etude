// Score attachments (#60): the picker hands back inconsistent mime types, so
// the kind rule and the file naming have to hold on their own.
import assert from 'node:assert';

import { dirFor, displayName, extOf, filesOf, forPiece, kindFor, pageFile, type Attachment } from '../src/lib/attachment-math.ts';

// --- kind -----------------------------------------------------------------
assert.equal(kindFor('score.pdf', 'application/pdf'), 'pdf');
assert.equal(kindFor('photo.JPG', 'image/jpeg'), 'image');
assert.equal(kindFor('shot.heic', 'image/heic'), 'image');
// Android content providers hand back octet-stream — the extension has to save it
assert.equal(kindFor('score.pdf', 'application/octet-stream'), 'pdf');
assert.equal(kindFor('page.PNG', 'application/octet-stream'), 'image');
assert.equal(kindFor('score.pdf'), 'pdf');
// anything we can't draw is refused, not stored as a mystery file
assert.equal(kindFor('track.mp3', 'audio/mpeg'), null);
assert.equal(kindFor('notes.txt'), null);
assert.equal(kindFor('noextension'), null);

// --- names ----------------------------------------------------------------
assert.equal(extOf('a.b.PDF'), 'pdf');
assert.equal(extOf('.hidden'), ''); // a leading dot is not an extension
assert.equal(displayName('Chopin Op 9 No 2.pdf'), 'Chopin Op 9 No 2');
assert.equal(displayName('.hidden'), '.hidden'); // never blank
assert.equal(displayName('noextension'), 'noextension');

// --- paths ----------------------------------------------------------------
assert.equal(dirFor('ab12cd34'), 'attachments/ab12cd34');
assert.equal(pageFile('ab12cd34', 0, 'png'), 'attachments/ab12cd34/1.png'); // pages are 1-based
assert.equal(pageFile('ab12cd34', 11, 'png'), 'attachments/ab12cd34/12.png');

// --- grouping -------------------------------------------------------------
const at = (id: string, piece: string, addedAt: number, files: string[]): Attachment =>
  ({ id, piece, name: id, kind: 'image', files, addedAt });
const all = [at('a', 'Nocturne', 1, ['attachments/a/1.png']), at('b', 'Fugue', 2, ['attachments/b/1.jpg']), at('c', 'Nocturne', 3, ['attachments/c/1.png', 'attachments/c/2.png'])];

assert.deepEqual(forPiece(all, 'Nocturne').map((a) => a.id), ['c', 'a']); // newest first
assert.deepEqual(forPiece(all, 'Unknown'), []);
// deleting a piece must take every page with it, not just the first
assert.deepEqual(filesOf(forPiece(all, 'Nocturne')), ['attachments/c/1.png', 'attachments/c/2.png', 'attachments/a/1.png']);

console.log('attachment ok');
