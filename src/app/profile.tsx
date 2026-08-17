import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon } from '@/components/icons';
import { Card, Overline, ScreenTitle } from '@/components/ui';
import { useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

// ponytail: settings rows are display-only stubs — wire real editors when settings need changing
const SETTINGS = [
  { label: 'Instruments', value: 'Piano, Guitar' },
  { label: 'Daily goal', value: '45 min' },
  { label: 'Break days', value: 'Sunday' },
  { label: 'Practice reminders', value: '7:00 PM' },
  { label: 'Week starts on', value: 'Monday' },
];

const NAME = 'Alex Rivera';

export default function Profile() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const initials = NAME.split(' ').map((w) => w[0]).join('');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Profile</ScreenTitle>

      <View style={s.head}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <Text style={s.name}>{NAME}</Text>
        <Text style={s.sub}>Piano & Guitar · practicing since 2023</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Total practice</Overline>
          <Text style={s.statNum}>
            {Math.round(store.totalMin / 60)}
            <Text style={s.statUnit}> hrs</Text>
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Best streak</Overline>
          <Text style={s.statNum}>
            {store.bestStreak}
            <Text style={s.statUnit}> days</Text>
          </Text>
        </Card>
      </View>

      <Card style={{ paddingVertical: 4, paddingHorizontal: 20 }}>
        {SETTINGS.map((row, i) => (
          <View key={row.label} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}>
            <Text style={s.rowLabel}>{row.label}</Text>
            <Text style={s.rowValue}>{row.value}</Text>
            <ChevronIcon />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  head: { alignItems: 'center', gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontFamily: F.head, fontSize: 22, color: C.bg },
  name: { fontFamily: F.head, fontSize: 24, color: C.ink },
  sub: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.sub },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: 28, color: C.ink },
  statUnit: { fontFamily: F.bodyMed, fontSize: 14, color: C.sub },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: 10 },
  rowLabel: { flex: 1, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  rowValue: { fontFamily: F.body, fontSize: 14, color: C.sub },
});
