import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Calendar } from '@/components/calendar';
import { Text } from '@/components/text';
import { Sheet, useInstrumentFilter } from '@/components/ui';
import { dayLabel, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function LogPastModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const inst = useInstrumentFilter();
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
      store.logMinutes(min, 'Quick log', 'Logged', pastDate, undefined, inst || undefined);
    } else {
      // split the minutes evenly across selections; first one takes the remainder
      const per = Math.floor(min / pastFoci.length);
      pastFoci.forEach((f, i) => {
        const m = i === 0 ? min - per * (pastFoci.length - 1) : per;
        if (m > 0) store.logMinutes(m, f.name, f.kind, pastDate, undefined, inst || undefined);
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
    <Sheet visible={visible} onClose={onClose} grabber style={s.sheet} contentStyle={{ gap: 16 }}>
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
    </Sheet>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  sheet: { backgroundColor: C.card, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingTop: 10, paddingBottom: 40 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
  focusScroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 24 },
  focusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  showAll: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub, marginTop: 10 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  input: { height: 48, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: r(6), borderWidth: 1.5, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: C.bg, fontSize: fs(13), lineHeight: fs(15), fontFamily: F.bodySemi },
  checkLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
