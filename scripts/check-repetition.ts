// Leitner scheduling for trouble spots (#93). Run: npm run check:repetition
import assert from 'node:assert/strict';

import { dueCount, dueSpots, INTERVALS, intervalFor, MAX_BOX, nextBox, reviewSpots, schedule, type SpotGrade } from '../src/lib/repetition-math.ts';
import { shiftKey } from '../src/lib/streak-math.ts';

const today = '2026-09-23';
const grades: SpotGrade[] = ['again', 'good', 'easy'];

// --- the box ladder, all 15 (box, grade) combinations, clamped at both ends ---
assert.deepEqual(INTERVALS, [1, 2, 4, 7, 14]);
assert.equal(MAX_BOX, 4);
for (let box = 0; box <= MAX_BOX; box++) {
  assert.equal(nextBox(box, 'again'), Math.max(0, box - 1), `again from ${box}`);
  assert.equal(nextBox(box, 'good'), box, `good from ${box}`);
  assert.equal(nextBox(box, 'easy'), Math.min(MAX_BOX, box + 1), `easy from ${box}`);
}
assert.equal(nextBox(0, 'again'), 0, 'floor');
assert.equal(nextBox(4, 'easy'), 4, 'ceiling');
// a corrupt box is pulled back into range before it moves
assert.equal(nextBox(9, 'easy'), 4);
assert.equal(nextBox(-3, 'again'), 0);
assert.equal(nextBox(Number.NaN, 'good'), 0);

// --- intervals follow the box ---
for (let box = 0; box <= MAX_BOX; box++) assert.equal(intervalFor(box), INTERVALS[box]);
assert.equal(intervalFor(7), 14);
assert.equal(intervalFor(-1), 1);

// --- schedule: dueAt = today + INTERVALS[newBox] ---
for (let box = 0; box <= MAX_BOX; box++)
  for (const g of grades) {
    const r = schedule(box, g, today);
    assert.equal(r.box, nextBox(box, g));
    assert.equal(r.dueAt, shiftKey(today, INTERVALS[r.box]), `${g} from ${box}`);
  }
assert.deepEqual(schedule(0, 'easy', today), { box: 1, dueAt: '2026-09-25' });
assert.deepEqual(schedule(0, 'good', today), { box: 0, dueAt: '2026-09-24' });
assert.deepEqual(schedule(3, 'easy', today), { box: 4, dueAt: '2026-10-07' }, 'crosses the month boundary');
assert.deepEqual(schedule(4, 'easy', '2026-12-25'), { box: 4, dueAt: '2027-01-08' }, 'crosses the year boundary');
assert.deepEqual(schedule(2, 'again', today), { box: 1, dueAt: '2026-09-25' });

// --- dueSpots ---
const spot = (id: string, label: string, dueAt: string, extra: Partial<{ box: number; resolvedAt: string }> = {}) => ({ id, label, box: 0, dueAt, ...extra });
const pieces = [
  { id: 'p1', name: 'Für Elise', spots: [spot('a', 'bars 12–16', '2026-09-20'), spot('b', 'coda', '2026-09-24'), spot('c', 'bars 1–4', today)] },
  { id: 'p2', name: 'Clair de Lune', archived: true, spots: [spot('d', 'bars 12–16', '2026-09-01')] },
  { id: 'p3', name: 'Gymnopédie', spots: [spot('e', 'bars 12–16', '2026-09-10'), spot('f', 'ending', '2026-09-01', { resolvedAt: '2026-09-15' })] },
  { id: 'p4', name: 'Nothing' },
];
{
  const due = dueSpots(pieces, today);
  // archived piece out, the future spot out, the solid spot out, today itself in, ascending
  assert.deepEqual(due.map((x) => x.spot.id), ['e', 'a', 'c']);
  assert.deepEqual(due.map((x) => x.piece.id), ['p3', 'p1', 'p1']);
  // two pieces share a spot label — the ids tell them apart, and the piece rides along
  const shared = due.filter((x) => x.spot.label === 'bars 12–16');
  assert.equal(shared.length, 2);
  assert.notEqual(shared[0].piece.id, shared[1].piece.id);
}
assert.deepEqual(dueSpots([], today), []);
assert.deepEqual(dueSpots(pieces, '2026-08-01'), [], 'nothing due before the earliest dueAt');
// same day, same label: never throws, both come back
assert.equal(dueSpots([{ spots: [spot('x', 'same', today), spot('y', 'same', today)] }], today).length, 2);

// --- dueCount per piece, the repertoire badge ---
assert.equal(dueCount(pieces[0], today), 2);
assert.equal(dueCount(pieces[1], today), 0, 'archived');
assert.equal(dueCount(pieces[2], today), 1, 'the solid one does not count');
assert.equal(dueCount(pieces[3], today), 0);

// --- reviewSpots: open only, due first, then by dueAt, at most three ---
{
  const spots = [
    spot('late', 'z', '2026-10-01'),
    spot('due2', 'b', '2026-09-22'),
    spot('solid', 's', '2026-09-01', { resolvedAt: today }),
    spot('due1', 'a', '2026-09-22'),
    spot('soon', 'y', '2026-09-24'),
    spot('due0', 'c', '2026-09-10'),
  ];
  assert.deepEqual(reviewSpots(spots).map((sp) => sp.id), ['due0', 'due1', 'due2']);
  assert.deepEqual(reviewSpots(spots, 5).map((sp) => sp.id), ['due0', 'due1', 'due2', 'soon', 'late']);
  assert.deepEqual(reviewSpots(undefined), []);
  assert.deepEqual(reviewSpots([]), []);
  // fewer than three: everything open, still ordered
  assert.deepEqual(reviewSpots([spot('l', 'l', '2026-10-01'), spot('e', 'e', '2026-09-01')]).map((sp) => sp.id), ['e', 'l']);
}

// --- shiftKey itself, since scheduling leans on it ---
assert.equal(shiftKey('2026-01-31', 1), '2026-02-01');
assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
assert.equal(shiftKey('2024-02-28', 1), '2024-02-29', 'leap day');
assert.equal(shiftKey(today, 0), today);

console.log('check-repetition: all assertions passed');
