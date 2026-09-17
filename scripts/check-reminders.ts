// The daily-reminder clock: a free-text time has to round-trip through the
// preset labels, and anything that isn't a time must be rejected rather than
// silently scheduling a notification at the wrong hour.
import assert from 'node:assert';

import { parseReminderTime, reminderLabel } from '../src/lib/reminder-time.ts';

// --- accepted forms -------------------------------------------------------
assert.deepEqual(parseReminderTime('7:00 PM'), { hour: 19, minute: 0 });
assert.deepEqual(parseReminderTime('17:45'), { hour: 17, minute: 45 });
assert.deepEqual(parseReminderTime('5:45pm'), { hour: 17, minute: 45 });
assert.deepEqual(parseReminderTime('8 am'), { hour: 8, minute: 0 });
assert.deepEqual(parseReminderTime('  9:05  '), { hour: 9, minute: 5 }, 'surrounding space trimmed');
assert.deepEqual(parseReminderTime('7:00 pm'), { hour: 19, minute: 0 }, 'case-insensitive meridiem');

// the two wrap points the % 12 arithmetic gets wrong if it is written naively
assert.deepEqual(parseReminderTime('12 AM'), { hour: 0, minute: 0 }, 'midnight is hour 0, not 12');
assert.deepEqual(parseReminderTime('12 PM'), { hour: 12, minute: 0 }, 'noon is hour 12, not 0');
assert.deepEqual(parseReminderTime('12:30 AM'), { hour: 0, minute: 30 });

// --- rejected -------------------------------------------------------------
for (const bad of ['Off', '', '   ', 'later', '24:00', '7:60', '13 PM', '0 AM', '25', '7:5', '7:000', '-7:00', '7:00 xm', '7 : 00'])
  assert.equal(parseReminderTime(bad), null, `should reject ${JSON.stringify(bad)}`);

// 24h input keeps working past 12 even though 12h input above that is a typo
assert.deepEqual(parseReminderTime('23:59'), { hour: 23, minute: 59 });
assert.deepEqual(parseReminderTime('0:00'), { hour: 0, minute: 0 });

// --- labels ---------------------------------------------------------------
assert.equal(reminderLabel({ hour: 0, minute: 0 }), '12:00 AM');
assert.equal(reminderLabel({ hour: 12, minute: 0 }), '12:00 PM');
assert.equal(reminderLabel({ hour: 17, minute: 45 }), '5:45 PM');
assert.equal(reminderLabel({ hour: 9, minute: 5 }), '9:05 AM', 'minutes zero-padded');

// every wall-clock minute survives label → parse → label unchanged, so a saved
// setting always matches one of the presets the picker offers
for (let hour = 0; hour < 24; hour++)
  for (const minute of [0, 5, 15, 30, 45, 59]) {
    const label = reminderLabel({ hour, minute });
    assert.deepEqual(parseReminderTime(label), { hour, minute }, `round-trip ${label}`);
    assert.equal(reminderLabel(parseReminderTime(label)!), label);
  }

console.log('check-reminders ok');
