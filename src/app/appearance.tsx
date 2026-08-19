import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlameIcon } from '@/components/icons';
import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { useStore } from '@/lib/store';
import {
  ACCENTS,
  F,
  FONT_SCALES,
  themed,
  useC,
  type AccentName,
  type RadiusMode,
  type T,
  type ThemeMode,
} from '@/lib/theme';

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const RADII: { value: RadiusMode; label: string }[] = [
  { value: 'sharp', label: 'Sharp' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Round' },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const s = useS();
  const C = useC();
  return (
    <Pressable style={[s.chip, selected && s.chipSel]} onPress={onPress}>
      <Text style={[s.chipText, selected && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export default function Appearance() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <Pressable hitSlop={8} onPress={() => router.back()}>
        <Text style={s.back}>‹ Settings</Text>
      </Pressable>
      <ScreenTitle>Appearance</ScreenTitle>

      {/* live preview — real components, so every knob shows instantly */}
      <Card>
        <View style={s.previewHead}>
          <Text style={s.previewGreeting}>Good evening</Text>
          <View style={s.previewPill}>
            <FlameIcon />
            <Text style={s.previewPillText}>12-day streak</Text>
          </View>
        </View>
        <Bar pct={64} color={C.accent} height={6} />
        <View style={s.previewBtn}>
          <Text style={s.previewBtnText}>Start practicing</Text>
        </View>
      </Card>

      <View>
        <Overline style={s.sectionLabel}>Theme</Overline>
        <View style={s.chipWrap}>
          {THEMES.map((o) => (
            <Chip key={o.value} label={o.label} selected={store.theme === o.value} onPress={() => store.updateSettings({ theme: o.value })} />
          ))}
        </View>
      </View>

      <View>
        <Overline style={s.sectionLabel}>Accent</Overline>
        <View style={s.dotRow}>
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
            const sel = store.accent === name;
            return (
              <Pressable
                key={name}
                accessibilityLabel={ACCENTS[name].label}
                style={[s.dotRing, sel && { borderColor: C.ink }]}
                onPress={() => store.updateSettings({ accent: name })}>
                <View style={[s.dot, { backgroundColor: ACCENTS[name].light[0] }]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Overline style={s.sectionLabel}>Text size</Overline>
        <View style={s.chipWrap}>
          {FONT_SCALES.map((o) => (
            <Chip key={o.value} label={o.label} selected={store.fontScale === o.value} onPress={() => store.updateSettings({ fontScale: o.value })} />
          ))}
        </View>
      </View>

      <View>
        <Overline style={s.sectionLabel}>Corners</Overline>
        <View style={s.chipWrap}>
          {RADII.map((o) => (
            <Chip key={o.value} label={o.label} selected={store.radius === o.value} onPress={() => store.updateSettings({ radius: o.value })} />
          ))}
        </View>
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.switchLabel}>Reduce motion</Text>
          <Text style={s.switchHint}>Skips springs and slide-ins</Text>
        </View>
        <Switch
          value={store.reduceMotion}
          onValueChange={(v) => store.updateSettings({ reduceMotion: v })}
          trackColor={{ true: C.accent, false: C.track }}
          thumbColor={C.card}
        />
      </View>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 22 },
  back: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  sectionLabel: { marginBottom: 10 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  previewGreeting: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 6, paddingHorizontal: 10 },
  previewPillText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.accent },
  previewBtn: { height: 44, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  previewBtnText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.bg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: r(999), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  dotRow: { flexDirection: 'row', gap: 12 },
  dotRing: { width: 40, height: 40, borderRadius: r(999), borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 28, height: 28, borderRadius: r(999) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  switchHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 2 },
}));
