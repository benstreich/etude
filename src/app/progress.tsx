import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

// ponytail: skills are static per the handoff — no tracking UI exists yet
const SKILLS = [
  { name: 'Scales & arpeggios', pct: 78, level: 'Confident' },
  { name: 'Sight reading', pct: 45, level: 'Improving' },
  { name: 'Chord voicings', pct: 52, level: 'Improving' },
  { name: 'Ear training', pct: 24, level: 'Early' },
];

export default function Progress() {
  const store = useStore();
  const insets = useSafeAreaInsets();

  const weekTotal = store.week.reduce((a, d) => a + d.min, 0);
  const max = Math.max(...store.week.map((d) => d.min), 1);

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
            {Math.round(weekTotal / 7)}
            <Text style={s.statUnit}> min</Text>
          </Text>
        </Card>
      </View>

      <Card>
        <Overline style={{ marginBottom: 16 }}>Last 7 days</Overline>
        <View style={s.chart}>
          {store.week.map((d, i) => (
            <View key={i} style={s.col}>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View
                  style={{
                    height: `${Math.max(4, (d.min / max) * 100)}%`,
                    backgroundColor: d.isToday ? C.accent : C.chartInactive,
                    borderTopLeftRadius: 5,
                    borderTopRightRadius: 5,
                  }}
                />
              </View>
              <Text style={[s.day, d.isToday && { color: C.accent, fontFamily: F.bodySemi }]}>{d.day}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Overline style={{ marginBottom: 4 }}>Skills</Overline>
        {SKILLS.map((sk) => (
          <View key={sk.name} style={{ marginTop: 16 }}>
            <View style={s.skillRow}>
              <Text style={s.skillName}>{sk.name}</Text>
              <Text style={s.skillLevel}>{sk.level}</Text>
            </View>
            <Bar pct={sk.pct} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: 28, color: C.ink },
  statUnit: { fontFamily: F.bodyMed, fontSize: 14, color: C.sub },
  chart: { height: 110, flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  day: { fontFamily: F.bodyMed, fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 8 },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  skillName: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  skillLevel: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub },
});
