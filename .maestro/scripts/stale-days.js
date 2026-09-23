// Seven practice days 15–21 days back, for suggested-session.yaml: enough
// history for the composer's data floor, and old enough that both seeded
// techniques count as stalled and due for review. Each day carries its
// calendar testID and whether the log-past calendar must page back a month.
var today = new Date();
var thisMonth = today.getMonth();
var days = [];
for (var back = 15; back <= 21; back++) {
  var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  days.push({ key: key, prev: d.getMonth() !== thisMonth ? 'yes' : 'no' });
}
output.days = days;
output.i = 0;
