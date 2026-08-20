import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditSessionSheet } from '@/components/edit-session';
import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { dateKey, dayLabel, FocusPeriod, Session, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const fmtTime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`);

// mix two #RRGGBB colors — heatmap steps derive from the accent so every accent works
const mix = (a: string, b: string, t: number) => {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const lerp = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return `#${lerp(1)}${lerp(3)}${lerp(5)}`;
};

const PERIODS: { key: FocusPeriod; label: string; days: number | null }[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: 'all', label: 'All', days: null },
];

export default function Progress() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selDate, setSelDate] = useState<string | null>(null);
  const empty = store.totalMin === 0 && store.sessions.length === 0;

  // calendar week honoring the "Week starts on" setting; chart below stays rolling last-7-days.
  // anchored on store.now so the numbers follow the calendar instead of freezing at mount
  const start = store.weekStart === 'Monday' ? 1 : 0;
  const elapsed = ((new Date(store.now).getDay() - start + 7) % 7) + 1;
  let weekTotal = 0;
  for (let i = 0; i < elapsed; i++) {
    const d = new Date(store.now);
    d.setDate(d.getDate() - i);
    weekTotal += store.minutesByDate[dateKey(d)] ?? 0;
  }
  // month heatmap: offset 0 = the current month
  const [monthOff, setMonthOff] = useState(0);
  const [editSess, setEditSess] = useState<Session | null>(null);
  const base = new Date(store.now);
  const mDate = new Date(base.getFullYear(), base.getMonth() - monthOff, 1);
  const mY = mDate.getFullYear();
  const mM = mDate.getMonth();
  const daysInMonth = new Date(mY, mM + 1, 0).getDate();
  const todayDayNum = base.getDate();
  const elapsedDays = monthOff === 0 ? todayDayNum : daysInMonth;
  let practiced = 0;
  for (let d = 1; d <= elapsedDays; d++) if ((store.minutesByDate[dateKey(new Date(mY, mM, d))] ?? 0) > 0) practiced++;
  const cells: (number | null)[] = [
    ...Array((mDate.getDay() - start + 7) % 7).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const dow = start === 1 ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const monthTitle = mDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const heat1 = mix(C.accent, C.bg, 0.65); // 1–24 min
  const heat2 = mix(C.accent, C.bg, 0.35); // 25–39 min

  // minutes per piece/technique within the selected period
  const period = PERIODS.find((p) => p.key === store.focusPeriod) ?? PERIODS[1];
  const cutoff = period.days ? dateKey(new Date(store.now - (period.days - 1) * 86400000)) : '';
  const byFocus: Record<string, number> = {};
  for (const sess of store.sessions) if (sess.date >= cutoff) byFocus[sess.title] = (byFocus[sess.title] ?? 0) + sess.min;
  const focusRows = Object.entries(byFocus).sort((a, b) => b[1] - a[1]);
  const focusMax = focusRows[0]?.[1] ?? 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Progress</ScreenTitle>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>This week</Overline>
          <Text style={s.statNum}>
            {weekTotal}
            <Text style={s.statUnit}> min</Text>
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Avg / day</Overline>
          <Text style={s.statNum}>
            {empty ? '—' : Math.round(weekTotal / elapsed)}
            {!empty && <Text style={s.statUnit}> min</Text>}
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>All time</Overline>
          <Text style={s.statNum}>
            {Math.floor(store.totalMin / 60)}
            <Text style={s.statUnit}> hr</Text>
          </Text>
        </Card>
      </View>

      {empty ? (
        <Card>
          <Overline style={{ marginBottom: 16 }}>Last 7 days</Overline>
          <View style={s.chart}>
            {[22, 48, 30, 64, 40, 78, 55].map((h, i) => (
              <View key={i} style={s.col}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      height: `${h}%`,
                      backgroundColor: i === 6 ? C.accentTint : C.track,
                      borderTopLeftRadius: 5,
                      borderTopRightRadius: 5,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'center', gap: 6, marginTop: 18 }}>
            <Text style={s.emptyTitle}>Your week will show up here</Text>
            <Text style={s.emptyText}>Log your first session and this chart starts filling in.</Text>
            <Pressable style={s.tintBtn} onPress={() => router.push('/practice')}>
              <Text style={s.tintBtnText}>Start practicing</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
      <Card>
        <View style={s.monthHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable hitSlop={10} onPress={() => setMonthOff((o) => o + 1)}>
              <Text style={[s.monthChev, { color: C.sub }]}>‹</Text>
            </Pressable>
            <Text style={s.monthTitle}>{monthTitle}</Text>
            <Pressable hitSlop={10} disabled={monthOff === 0} onPress={() => setMonthOff((o) => o - 1)}>
              <Text style={[s.monthChev, { color: monthOff === 0 ? C.faint : C.sub }]}>›</Text>
            </Pressable>
          </View>
          <Text style={s.monthCount}>
            {practiced} of {elapsedDays} days
          </Text>
        </View>
        <View style={s.dowRow}>
          {dow.map((d, i) => (
            <Text key={i} style={s.dowText}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((row, wi) => (
          <View key={wi} style={s.weekRow}>
            {row.map((day, di) => {
              if (day === null) return <View key={di} style={s.cell} />;
              const key = dateKey(new Date(mY, mM, day));
              const min = store.minutesByDate[key] ?? 0;
              const future = monthOff === 0 && day > elapsedDays;
              const isToday = monthOff === 0 && day === todayDayNum;
              const bg = future ? 'transparent' : min === 0 ? C.track : min < 25 ? heat1 : min < 40 ? heat2 : C.accent;
              const num = future ? C.faint : min === 0 ? C.tertiary : min < 25 ? C.accentDark : '#FFFFFF';
              return (
                <Pressable
                  key={di}
                  disabled={future}
                  style={[
                    s.cell,
                    { backgroundColor: bg },
                    future && { borderWidth: 1, borderStyle: 'dashed', borderColor: C.cardBorder },
                    isToday && { borderWidth: 2, borderStyle: 'solid', borderColor: C.ink },
                    selDate === key && !isToday && { borderWidth: 2, borderStyle: 'solid', borderColor: C.accentDark },
                  ]}
                  onPress={() => setSelDate(selDate === key ? null : key)}>
                  <Text style={[s.cellNum, { color: num }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={s.legendRow}>
          <Text style={s.legendText}>less</Text>
          {[C.track, heat1, heat2, C.accent].map((c, i) => (
            <View key={i} style={[s.legendSwatch, { backgroundColor: c }]} />
          ))}
          <Text style={s.legendText}>more</Text>
        </View>
        {selDate && (
          <View style={s.dayDetail}>
            <View style={s.skillRow}>
              <Text style={s.skillName}>{dayLabel(selDate, store.today)}</Text>
              <Text style={s.skillLevel}>{fmtTime(store.minutesByDate[selDate] ?? 0)}</Text>
            </View>
            {store.sessions
              .filter((sess) => sess.date === selDate)
              .map((sess) => (
                <Pressable key={sess.id} style={{ marginTop: 6 }} onPress={() => setEditSess(sess)}>
                  <View style={s.detailRow}>
                    <Text style={s.detailTitle}>{sess.title}</Text>
                    <Text style={s.skillLevel}>{fmtTime(sess.min)}</Text>
                  </View>
                  {!!sess.note && <Text style={s.detailNote}>{sess.note}</Text>}
                </Pressable>
              ))}
            {!store.sessions.some((sess) => sess.date === selDate) && (
              <Text style={s.detailEmpty}>No session details for this day</Text>
            )}
          </View>
        )}
      </Card>
      )}

      {store.sessions.length > 0 && (
        <Card>
          <View style={s.focusHead}>
            <Overline>Time by focus</Overline>
            <View style={s.segTrack}>
              {PERIODS.map((p) => {
                const sel = p.key === period.key;
                return (
                  <Pressable key={p.key} style={[s.segBtn, sel && s.segBtnSel]} onPress={() => store.updateSettings({ focusPeriod: p.key })}>
                    <Text style={[s.segText, sel && { color: C.ink }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {focusRows.length === 0 && <Text style={s.detailEmpty}>Nothing logged in this period</Text>}
          {focusRows.map(([name, min]) => (
            <View key={name} style={{ marginTop: 16 }}>
              <View style={s.skillRow}>
                <Text style={s.skillName}>{name}</Text>
                <Text style={s.skillLevel}>{fmtTime(min)}</Text>
              </View>
              <Bar pct={(min / focusMax) * 100} />
            </View>
          ))}
        </Card>
      )}

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: fs(28), color: C.ink },
  statUnit: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  chart: { height: 110, flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthTitle: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink, marginHorizontal: 6 },
  monthChev: { fontSize: fs(20), lineHeight: fs(22), paddingHorizontal: 4 },
  monthCount: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  dowRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  dowText: { flex: 1, textAlign: 'center', fontFamily: F.bodySemi, fontSize: fs(10), color: C.tertiary },
  weekRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: r(8), alignItems: 'center', justifyContent: 'center' },
  cellNum: { fontFamily: F.bodySemi, fontSize: fs(11.5) },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: r(3.5) },
  legendText: { fontFamily: F.body, fontSize: fs(10.5), color: C.tertiary, marginHorizontal: 2 },
  focusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  segTrack: { flexDirection: 'row', backgroundColor: C.track, borderRadius: r(999), padding: 2.5 },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayDetail: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.hairline },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailTitle: { fontFamily: F.body, fontSize: fs(14), color: C.sub },
  detailNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.subStrong, fontStyle: 'italic', marginTop: 2 },
  detailEmpty: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong, marginTop: 4 },
  skillName: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  skillLevel: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  emptyTitle: { fontFamily: F.head, fontSize: fs(16), color: C.ink },
  emptyText: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(20), color: C.sub, maxWidth: 250, textAlign: 'center' },
  tintBtn: { height: 42, paddingHorizontal: 18, borderRadius: r(12), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  tintBtnText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
}));
