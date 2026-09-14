import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Calendar } from '@/components/calendar';
import { Text } from '@/components/text';
import { SHEET_AVOID } from '@/components/ui';
import { dayLabel, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function LogPastModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const winH = useWindowDimensions().height;
  const insets = useSafeAreaInsets();
  const [pastDate, setPastDate] = useState<string | null>(null);
  const [pastMin, setPastMin] = useState('');
  const [pastFoci, setPastFoci] = useState<{ name: string; kind: 'Piece' | 'Technique' }[]>([]);
  const [addMore, setAddMore] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const focusOptions: { name: string; kind: 'Piece' | 'Technique' }[] = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ name: p.name, kind: 'Piece' as const })),
    ...store.techniques.map((t) => ({ name: t, kind: 'Technique' as const })),
  ];
  const sameFocus = (a: { name: string; kind: string }, b: { name: string; kind: string }) =>
    a.name === b.name && a.kind === b.kind;
  const toggleFocus = (f: { name: string; kind: 'Piece' | 'Technique' }) =>
    setPastFoci((cur) => (cur.some((x) => sameFocus(x, f)) ? cur.filter((x) => !sameFocus(x, f)) : [...cur, f]));

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
    store.showToast(store.t('logPast.addedToast', { min, day: dayLabel(pastDate, store.today, store.t, store.lang) }));
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
        <KeyboardAvoidingView behavior={SHEET_AVOID} pointerEvents="box-none">
        <Pressable style={[s.sheet, { height: winH - insets.top - 12 }]} onPress={() => {}}>
          <View style={s.grabber} />
          {/* flex-end keeps the form at the bottom, within thumb reach, when it doesn't fill the sheet */}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, flexGrow: 1, justifyContent: 'flex-end' }}>
            <Text style={s.sheetTitle}>{store.t('logPast.title')}</Text>

            <Calendar value={pastDate} onPick={setPastDate} direction="past" />

            {focusOptions.length > 0 && (
              <View>
                {showAll ? (
                  <View style={s.focusWrap}>
                    {focusOptions.map((f) => {
                      const sel = pastFoci.some((x) => sameFocus(x, f));
                      return (
                        <Pressable key={`${f.kind}:${f.name}`} style={[s.chip, sel && s.chipSel]} onPress={() => toggleFocus(f)}>
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
                      const sel = pastFoci.some((x) => sameFocus(x, f));
                      return (
                        <Pressable key={`${f.kind}:${f.name}`} style={[s.chip, sel && s.chipSel]} onPress={() => toggleFocus(f)}>
                          <Text style={[s.chipText, sel && { color: C.accent }]}>{f.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <Pressable hitSlop={8} onPress={() => setShowAll((v) => !v)}>
                  <Text style={s.showAll}>{showAll ? store.t('logPast.showLess') : store.t('logPast.showAll')}</Text>
                </Pressable>
              </View>
            )}

            <TextInput
              style={s.input}
              value={pastMin}
              onChangeText={(t) => setPastMin(t.replace(/\D/g, '').slice(0, 3))}
              placeholder={store.t('logPast.minutesPlaceholder')}
              placeholderTextColor={C.tertiary}
              keyboardType="number-pad"
              onSubmitEditing={logPast}
            />
            <Pressable style={s.checkRow} hitSlop={8} onPress={() => setAddMore((v) => !v)}>
              <View style={[s.checkbox, addMore && { backgroundColor: C.accent, borderColor: C.accent }]}>
                {addMore && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={s.checkLabel}>{store.t('logPast.addMoreAfterSaving')}</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, (!pastDate || !Number(pastMin)) && { opacity: 0.4 }]} onPress={logPast}>
              <Text style={s.saveBtnText}>{store.t('logPast.add')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingTop: 10, paddingBottom: 40 },
  grabber: { width: 36, height: 4.5, borderRadius: r(999), backgroundColor: C.chartInactive, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
  focusScroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 24 },
  focusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  showAll: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub, marginTop: 10 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  input: { height: 48, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: r(6), borderWidth: 1.5, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: C.bg, fontSize: fs(13), lineHeight: fs(15), fontFamily: F.bodySemi },
  checkLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
