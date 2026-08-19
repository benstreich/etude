import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { dateKey, dayLabel, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

export function LogPastModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const store = useStore();
  const [pastDate, setPastDate] = useState<string | null>(null);
  const [pastMin, setPastMin] = useState('');
  const [pastFoci, setPastFoci] = useState<{ name: string; kind: 'Piece' | 'Technique' }[]>([]);
  const [addMore, setAddMore] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // calendar grid for the displayed month
  const todayKey = dateKey();
  const startDow = store.weekStart === 'Monday' ? 1 : 0;
  const dowLetters = Array.from({ length: 7 }, (_, i) => 'SMTWTFS'[(i + startDow) % 7]);
  const firstDow = (calMonth.getDay() - startDow + 7) % 7;
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const atCurrentMonth =
    calMonth.getFullYear() === new Date().getFullYear() && calMonth.getMonth() === new Date().getMonth();
  const shiftMonth = (by: number) => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  const focusOptions: { name: string; kind: 'Piece' | 'Technique' }[] = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ name: p.name, kind: 'Piece' as const })),
    ...store.techniques.map((t) => ({ name: t, kind: 'Technique' as const })),
  ];
  const toggleFocus = (f: { name: string; kind: 'Piece' | 'Technique' }) =>
    setPastFoci((cur) => (cur.some((x) => x.name === f.name) ? cur.filter((x) => x.name !== f.name) : [...cur, f]));

  const logPast = () => {
    const min = Number(pastMin);
    if (!min || !pastDate) return;
    if (pastFoci.length === 0) {
      store.logMinutes(min, 'Quick log', 'Logged', pastDate);
    } else {
      // split the minutes evenly across selections; first one takes the remainder
      const per = Math.floor(min / pastFoci.length);
      pastFoci.forEach((f, i) => {
        const m = i === 0 ? min - per * (pastFoci.length - 1) : per;
        if (m > 0) store.logMinutes(m, f.name, f.kind, pastDate);
      });
    }
    store.showToast(`Added ${min} min · ${dayLabel(pastDate)}`);
    setPastMin('');
    setPastFoci([]);
    if (!addMore) {
      onClose();
      setPastDate(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
            <Text style={s.sheetTitle}>Log past practice</Text>

            <View style={s.calHeader}>
              <Pressable style={s.calNav} hitSlop={8} onPress={() => shiftMonth(-1)}>
                <Text style={s.calNavText}>‹</Text>
              </Pressable>
              <Text style={s.calMonth}>{calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
              <Pressable
                style={[s.calNav, atCurrentMonth && { opacity: 0.25 }]}
                hitSlop={8}
                disabled={atCurrentMonth}
                onPress={() => shiftMonth(1)}>
                <Text style={s.calNavText}>›</Text>
              </Pressable>
            </View>
            <View style={s.calGrid}>
              {dowLetters.map((l, i) => (
                <Text key={`h${i}`} style={s.calDow}>
                  {l}
                </Text>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={s.calCell} />;
                const k = dateKey(new Date(calMonth.getFullYear(), calMonth.getMonth(), day));
                const disabled = k > todayKey;
                const sel = pastDate === k;
                return (
                  <Pressable key={k} style={s.calCell} disabled={disabled} onPress={() => setPastDate(k)}>
                    <View style={[s.calDay, sel && { backgroundColor: C.accent }]}>
                      <Text style={[s.calDayText, disabled && { color: C.faint }, sel && { color: C.bg, fontFamily: F.bodySemi }]}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {focusOptions.length > 0 && (
              <View>
                {showAll ? (
                  <View style={s.focusWrap}>
                    {focusOptions.map((f) => {
                      const sel = pastFoci.some((x) => x.name === f.name);
                      return (
                        <Pressable key={f.name} style={[s.chip, sel && s.chipSel]} onPress={() => toggleFocus(f)}>
                          <Text style={[s.chipText, sel && { color: C.accent }]}>{f.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginHorizontal: -24 }}
                    contentContainerStyle={s.focusScroll}>
                    {focusOptions.map((f) => {
                      const sel = pastFoci.some((x) => x.name === f.name);
                      return (
                        <Pressable key={f.name} style={[s.chip, sel && s.chipSel]} onPress={() => toggleFocus(f)}>
                          <Text style={[s.chipText, sel && { color: C.accent }]}>{f.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <Pressable hitSlop={8} onPress={() => setShowAll((v) => !v)}>
                  <Text style={s.showAll}>{showAll ? 'Show less ▴' : 'Show all ▾'}</Text>
                </Pressable>
              </View>
            )}

            <TextInput
              style={s.input}
              value={pastMin}
              onChangeText={(t) => setPastMin(t.replace(/\D/g, '').slice(0, 3))}
              placeholder="Minutes"
              placeholderTextColor={C.tertiary}
              keyboardType="number-pad"
              onSubmitEditing={logPast}
            />
            <Pressable style={s.checkRow} hitSlop={8} onPress={() => setAddMore((v) => !v)}>
              <View style={[s.checkbox, addMore && { backgroundColor: C.accent, borderColor: C.accent }]}>
                {addMore && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={s.checkLabel}>Add more after saving</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, (!pastDate || !Number(pastMin)) && { opacity: 0.4 }]} onPress={logPast}>
              <Text style={s.saveBtnText}>Add</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calNav: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calNavText: { fontSize: 22, color: C.sub, lineHeight: 26 },
  calMonth: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: '14.28%', textAlign: 'center', fontFamily: F.bodySemi, fontSize: 11, color: C.tertiary, marginBottom: 6 },
  calCell: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  calDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDayText: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink },
  focusScroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 24 },
  focusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  showAll: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub, marginTop: 10 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.ink },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: C.bg, fontSize: 13, lineHeight: 15, fontFamily: F.bodySemi },
  checkLabel: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink },
  saveBtn: { height: 52, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },
});
