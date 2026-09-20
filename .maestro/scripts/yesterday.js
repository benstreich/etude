// Yesterday's dateKey for the log-past flow, plus whether reaching it means
// paging the calendar back a month. Maestro flows are static; the date is not.
const now = new Date();
const d = new Date(now.getTime() - 86400000);
const pad = (n) => (n < 10 ? '0' + n : '' + n);
output.yd = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
output.prevMonth = d.getMonth() !== now.getMonth() ? 'yes' : 'no';
