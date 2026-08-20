import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { dateKey, dayLabel, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const fmtTime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`);

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
  const max = Math.max(...store.week.map((d) => d.min), 1);

  // minutes per piece/technique, from logged sessions
  const byFocus: Record<string, number> = {};
  for (const sess of store.sessions) byFocus[sess.title] = (byFocus[sess.title] ?? 0) + sess.min;
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
        <Overline style={{ marginBottom: 16 }}>Last 7 days</Overline>
        <View style={s.chart}>
          {store.week.map((d, i) => {
            const sel = selDate === d.date;
            return (
              <Pressable key={i} style={s.col} onPress={() => setSelDate(sel ? null : d.date)}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      height: `${Math.max(4, (d.min / max) * 100)}%`,
                      backgroundColor: sel || d.isToday ? C.accent : C.chartInactive,
                      opacity: selDate && !sel ? 0.5 : 1,
                      borderTopLeftRadius: 5,
                      borderTopRightRadius: 5,
                    }}
                  />
                </View>
                <Text style={[s.day, (sel || d.isToday) && { color: C.accent, fontFamily: F.bodySemi }]}>{d.day}</Text>
              </Pressable>
            );
          })}
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
                <View key={sess.id} style={{ marginTop: 6 }}>
                  <View style={s.detailRow}>
                    <Text style={s.detailTitle}>{sess.title}</Text>
                    <Text style={s.skillLevel}>{fmtTime(sess.min)}</Text>
                  </View>
                  {!!sess.note && <Text style={s.detailNote}>{sess.note}</Text>}
                </View>
              ))}
            {!store.sessions.some((sess) => sess.date === selDate) && (
              <Text style={s.detailEmpty}>No session details for this day</Text>
            )}
          </View>
        )}
      </Card>
      )}

      {focusRows.length > 0 && (
        <Card>
          <Overline style={{ marginBottom: 4 }}>Time by focus</Overline>
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
  day: { fontFamily: F.bodyMed, fontSize: fs(11), color: C.sub, textAlign: 'center', marginTop: 8 },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayDetail: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.hairline },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailTitle: { fontFamily: F.body, fontSize: fs(14), color: C.sub },
  detailNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, fontStyle: 'italic', marginTop: 2 },
  detailEmpty: { fontFamily: F.body, fontSize: fs(13), color: C.tertiary, marginTop: 4 },
  skillName: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  skillLevel: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  emptyTitle: { fontFamily: F.head, fontSize: fs(16), color: C.ink },
  emptyText: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(20), color: C.sub, maxWidth: 250, textAlign: 'center' },
  tintBtn: { height: 42, paddingHorizontal: 18, borderRadius: r(12), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  tintBtnText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
}));
