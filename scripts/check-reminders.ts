// The daily-reminder clock: a free-text time has to round-trip through the
// preset labels, and anything that isn't a time must be rejected rather than
// silently scheduling a notification at the wrong hour.
import assert from 'node:assert';

import { parseReminderTime, reminderDisplay, reminderFireDates, reminderLabel } from '../src/lib/reminder-time.ts';

// --- skipping today: one-offs from tomorrow, local wall clock, DST-safe -------
{
  const now = new Date(2026, 2, 28, 20, 15); // Sat 28 Mar 2026, 20:15 — DST starts the next night in Europe
  const dates = reminderFireDates(now, { hour: 19, minute: 0 }, 5);
  assert.equal(dates.length, 5);
  assert.deepEqual(dates.map((d) => [d.getDate(), d.getHours(), d.getMinutes()]), [[29, 19, 0], [30, 19, 0], [31, 19, 0], [1, 19, 0], [2, 19, 0]], 'tomorrow onwards at the wall-clock time, across the DST change and the month end');
  assert.ok(dates.every((d, i) => i === 0 || d.getTime() > dates[i - 1].getTime()), 'ascending');
  assert.ok(dates[0].getTime() > now.getTime(), 'never in the past');
  // a time earlier than now still starts tomorrow — today was practised
  assert.equal(reminderFireDates(now, { hour: 9, minute: 0 }, 1)[0].getDate(), 29);
}

// --- display: German reads 24-hour, English keeps the canonical label --------
assert.equal(reminderDisplay('7:00 PM', 'de'), '19:00');
assert.equal(reminderDisplay('9:05 AM', 'de'), '9:05');
assert.equal(reminderDisplay('12:30 AM', 'de'), '0:30');
assert.equal(reminderDisplay('7:00 PM', 'en'), '7:00 PM');
assert.equal(reminderDisplay('Off', 'de'), 'Off', 'a non-time passes through for the caller to translate');

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
