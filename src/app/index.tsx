import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlameIcon, LogoMark, PlayIcon } from '@/components/icons';
import { Bar, Card } from '@/components/ui';
import { dateKey, dayLabel, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const dateLine = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

export default function Home() {
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [customMin, setCustomMin] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [pastDate, setPastDate] = useState<string | null>(null);
  const [pastMin, setPastMin] = useState('');

  const quickLog = (min: number) => {
    if (!min) return;
    store.logMinutes(min, 'Quick log', 'Logged');
    store.showToast(`Added ${min} minutes`);
    setCustomMin('');
  };

  // yesterday back through 7 days ago
  const pastDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (i + 1));
    return dateKey(d);
  });

  const logPast = () => {
    const min = Number(pastMin);
    if (!min || !pastDate) return;
    store.logMinutes(min, 'Quick log', 'Logged', pastDate);
    store.showToast(`Added ${min} min · ${dayLabel(pastDate)}`);
    setPastOpen(false);
    setPastMin('');
    setPastDate(null);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
      <View style={s.logoRow}>
        <LogoMark size={26} />
        <Text style={s.wordmark}>Étude</Text>
      </View>

      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.date}>{dateLine()}</Text>
          <Text style={s.greeting}>{greeting()}</Text>
        </View>
        {store.displayStreak > 0 && (
          <View style={s.streakPill}>
            <FlameIcon />
            <Text style={s.streakText}>{store.displayStreak}-day streak</Text>
          </View>
        )}
      </View>

      <Card style={{ padding: 16 }}>
        <View style={s.todayRow}>
          <Text style={s.todayLabel}>Today</Text>
          <Text style={s.todayMeta}>
            {store.todayMin} min / {store.dailyGoal} min goal
          </Text>
        </View>
        <Bar pct={(store.todayMin / store.dailyGoal) * 100} color={C.accent} height={6} />
      </Card>

      <Pressable style={({ pressed }) => [s.primaryBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => router.push('/practice')}>
        <PlayIcon />
        <Text style={s.primaryBtnText}>Start practicing</Text>
      </Pressable>

      <View>
        <Text style={s.helper}>Practiced without the timer? Log it in one tap.</Text>
        <View style={s.quickRow}>
          {store.quickLog.map((m, i) => (
            <Pressable key={i} style={s.chip} onPress={() => quickLog(m)}>
              <Text style={s.chipText}>+{m} min</Text>
            </Pressable>
          ))}
          <TextInput
            style={s.minInput}
            value={customMin}
            onChangeText={(t) => setCustomMin(t.replace(/\D/g, '').slice(0, 3))}
            placeholder="min"
            placeholderTextColor={C.tertiary}
            keyboardType="number-pad"
            onSubmitEditing={() => quickLog(Number(customMin))}
          />
          <Pressable style={s.plusBtn} onPress={() => quickLog(Number(customMin))}>
            <Text style={s.plusText}>+</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setPastOpen(true)}>
          <Text style={s.pastLink}>Forgot a day? Log past practice</Text>
        </Pressable>
      </View>

      {store.sessions.length > 0 && (
        <Card style={{ padding: 16 }}>
          {store.sessions.slice(0, 3).map((sess, i) => (
            <View key={sess.id} style={[s.sessRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.sessTitle}>{sess.title}</Text>
                <Text style={s.sessMeta}>
                  {sess.meta.includes('·') ? sess.meta : `${dayLabel(sess.date)} · ${sess.meta}`}
                </Text>
              </View>
              <Text style={s.sessMin}>{sess.min} min</Text>
              <Pressable style={s.delBtn} onPress={() => store.deleteSession(sess.id)} hitSlop={8}>
                <Text style={s.delText}>×</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Modal visible={pastOpen} transparent animationType="fade" onRequestClose={() => setPastOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setPastOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Log past practice</Text>
            <View style={s.dayWrap}>
              {pastDays.map((k) => (
                <Pressable
                  key={k}
                  style={[s.dayChip, pastDate === k && s.dayChipSel]}
                  onPress={() => setPastDate(k)}>
                  <Text style={[s.dayChipText, pastDate === k && { color: C.accent }]}>{dayLabel(k)}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={s.sheetInput}
              value={pastMin}
              onChangeText={(t) => setPastMin(t.replace(/\D/g, '').slice(0, 3))}
              placeholder="Minutes"
              placeholderTextColor={C.tertiary}
              keyboardType="number-pad"
              onSubmitEditing={logPast}
            />
            <Pressable style={[s.saveBtn, (!pastDate || !Number(pastMin)) && { opacity: 0.4 }]} onPress={logPast}>
              <Text style={s.saveBtnText}>Add</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: F.head, fontSize: 16, color: C.ink, letterSpacing: -0.16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  date: { fontFamily: F.bodySemi, fontSize: 12, letterSpacing: 1.4, color: C.tertiary, marginBottom: 6 },
  greeting: { fontFamily: F.head, fontSize: 34, color: C.ink },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  streakText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accent },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  todayLabel: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  todayMeta: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub },
  primaryBtn: { height: 56, borderRadius: 14, backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryBtnText: { fontFamily: F.bodySemi, fontSize: 17, color: C.bg },
  helper: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub, marginBottom: 10 },
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.ink },
  minInput: { width: 64, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, textAlign: 'center', fontFamily: F.bodyMed, fontSize: 14, color: C.ink },
  plusBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.bg, fontSize: 22, lineHeight: 24, fontFamily: F.bodyMed },
  sessRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  sessTitle: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  sessMeta: { fontFamily: F.body, fontSize: 12.5, color: C.sub, marginTop: 2 },
  sessMin: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink, marginRight: 10 },
  delBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  delText: { fontSize: 18, color: C.sub, lineHeight: 20 },
  pastLink: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub, marginTop: 12, textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 16 },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink },
  dayWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  dayChipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  dayChipText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.ink },
  sheetInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  saveBtn: { height: 52, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },
});
