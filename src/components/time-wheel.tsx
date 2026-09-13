import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { F, themed, useC, type T } from '@/lib/theme';

// ponytail: two snapping ScrollViews instead of a native picker — @expo/ui's
// DateTimePicker needs a dev build and this has to work in Expo Go.
const ROW = 40;
const VISIBLE = 3; // rows shown; the wheel is padded by one row top and bottom
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function Wheel({ items, value, onPick, fmt }: { items: number[]; value: number; onPick: (v: number) => void; fmt: (v: number) => string }) {
  const s = useS();
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, items.indexOf(value));
  return (
    <ScrollView
      ref={ref}
      style={{ height: ROW * VISIBLE }}
      contentContainerStyle={{ paddingVertical: ROW }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: index * ROW }}
      onMomentumScrollEnd={(e) => {
        const i = Math.round(e.nativeEvent.contentOffset.y / ROW);
        onPick(items[Math.min(items.length - 1, Math.max(0, i))]);
      }}>
      {items.map((v) => (
        <Pressable
          key={v}
          style={s.cell}
          onPress={() => {
            onPick(v);
            ref.current?.scrollTo({ y: items.indexOf(v) * ROW, animated: true });
          }}>
          <Text style={[s.cellText, v === value && s.cellTextOn]}>{fmt(v)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function TimeWheel({ value, onChange }: { value: { hour: number; minute: number }; onChange: (v: { hour: number; minute: number }) => void }) {
  const s = useS();
  const C = useC();
  const pm = value.hour >= 12;
  const h12 = value.hour % 12 || 12;
  const setH12 = (h: number) => onChange({ ...value, hour: (h % 12) + (pm ? 12 : 0) });
  const setPm = (next: boolean) => onChange({ ...value, hour: (value.hour % 12) + (next ? 12 : 0) });

  return (
    <View style={s.wrap}>
      <View style={[s.selection, { borderColor: C.inputBorder }]} pointerEvents="none" />
      <Wheel items={HOURS} value={h12} onPick={setH12} fmt={(v) => String(v)} />
      <Text style={s.colon}>:</Text>
      <Wheel items={MINUTES} value={value.minute} onPick={(m) => onChange({ ...value, minute: m })} fmt={(v) => String(v).padStart(2, '0')} />
      <View style={s.ampm}>
        {[false, true].map((v) => (
          <Pressable key={String(v)} style={[s.ampmBtn, pm === v && { backgroundColor: C.ink }]} onPress={() => setPm(v)}>
            <Text style={[s.ampmText, pm === v && { color: C.bg }]}>{v ? 'PM' : 'AM'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selection: { position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, borderTopWidth: 1, borderBottomWidth: 1, borderRadius: r(8) },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center', minWidth: 48 },
  cellText: { fontFamily: F.bodyMed, fontSize: fs(20), color: C.sub },
  cellTextOn: { color: C.ink },
  colon: { fontFamily: F.bodyMed, fontSize: fs(20), color: C.ink },
  ampm: { marginLeft: 8, gap: 6 },
  ampmBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: r(10), borderWidth: 1, borderColor: C.inputBorder },
  ampmText: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.ink },
}));
