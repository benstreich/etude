import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Bar, Card, Overline, ScreenTitle, Switch } from '@/components/ui';
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

const THEMES: { value: ThemeMode; key: string }[] = [
  { value: 'system', key: 'appearance.system' },
  { value: 'light', key: 'appearance.light' },
  { value: 'dark', key: 'appearance.dark' },
];
const RADII: { value: RadiusMode; key: string }[] = [
  { value: 'sharp', key: 'appearance.sharp' },
  { value: 'soft', key: 'appearance.soft' },
  { value: 'round', key: 'appearance.round' },
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

const SWATCH_EASE = Easing.bezier(0.2, 1.3, 0.4, 1);

/** An accent swatch. The selected ring draws in and the dot dips to 0.88 and settles, both on the tap. */
function AccentSwatch({ color, selected, label, onPress }: { color: string; selected: boolean; label: string; onPress: () => void }) {
  const s = useS();
  const C = useC();
  const ring = useSharedValue(selected ? 1 : 0);
  const dip = useSharedValue(1);
  useEffect(() => {
    ring.value = withTiming(selected ? 1 : 0, { duration: 200, easing: SWATCH_EASE });
    if (selected) dip.value = withSequence(withTiming(0.88, { duration: 90 }), withTiming(1, { duration: 110, easing: SWATCH_EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const ringStyle = useAnimatedStyle(() => ({ borderColor: interpolateColor(ring.value, [0, 1], ['transparent', C.ink]) }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dip.value }] }));
  return (
    <Pressable accessibilityLabel={label} onPress={onPress}>
      <Animated.View style={[s.dotRing, ringStyle]}>
        <Animated.View style={[s.dot, { backgroundColor: color }, dotStyle]} />
      </Animated.View>
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
        <Text style={s.back}>{store.t('appearance.backToSettings')}</Text>
      </Pressable>
      <ScreenTitle>{store.t('appearance.title')}</ScreenTitle>

      {/* A specimen of the knobs below — accent, corners, text size — rather than a
          mock of Home. The old mock still showed a "start practising" button Home
          hasn't had since Progress moved onto it, so it aged into a lie. */}
      <Card>
        <Text style={s.previewGreeting}>{store.t('appearance.previewSample')}</Text>
        <View style={{ marginTop: 12 }}>
          <Bar pct={64} color={C.accent} height={6} />
        </View>
      </Card>

      <View>
        <Overline style={s.sectionLabel}>{store.t('appearance.theme')}</Overline>
        <View style={s.chipWrap}>
          {THEMES.map((o) => (
            <Chip key={o.value} label={store.t(o.key)} selected={store.theme === o.value} onPress={() => store.updateSettings({ theme: o.value })} />
          ))}
        </View>
      </View>

      <View>
        <Overline style={s.sectionLabel}>{store.t('appearance.accent')}</Overline>
        <View style={s.dotRow}>
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
            <AccentSwatch
              key={name}
              color={ACCENTS[name].light[0]}
              selected={store.accent === name}
              label={store.t(ACCENTS[name].label)}
              onPress={() => store.updateSettings({ accent: name })}
            />
          ))}
        </View>
        {/* #80: icon and widgets follow along; the Android launcher may blink the app away for a moment */}
        <Text style={s.accentHint}>{store.t('appearance.accentHint')}</Text>
      </View>

      <View>
        <Overline style={s.sectionLabel}>{store.t('appearance.textSize')}</Overline>
        <View style={s.chipWrap}>
          {FONT_SCALES.map((o) => (
            <Chip key={o.value} label={store.t(o.label)} selected={store.fontScale === o.value} onPress={() => store.updateSettings({ fontScale: o.value })} />
          ))}
        </View>
      </View>

      <View>
        <Overline style={s.sectionLabel}>{store.t('appearance.corners')}</Overline>
        <View style={s.chipWrap}>
          {RADII.map((o) => (
            <Chip key={o.value} label={store.t(o.key)} selected={store.radius === o.value} onPress={() => store.updateSettings({ radius: o.value })} />
          ))}
        </View>
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.switchLabel}>{store.t('appearance.reduceMotion')}</Text>
          <Text style={s.switchHint}>{store.t('appearance.reduceMotionHint')}</Text>
        </View>
        <Switch value={store.reduceMotion} onChange={(v) => store.updateSettings({ reduceMotion: v })} />
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.switchLabel}>{store.t('appearance.sounds')}</Text>
          <Text style={s.switchHint}>{store.t('appearance.soundsHint')}</Text>
        </View>
        <Switch value={store.sounds} onChange={(v) => store.updateSettings({ sounds: v })} />
      </View>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 22 },
  back: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  sectionLabel: { marginBottom: 10 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  previewGreeting: { fontFamily: F.head, fontSize: fs(24), color: C.ink },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 6, paddingHorizontal: 10 },
  previewPillText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.accent },
  previewBtn: { height: 44, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  previewBtnText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.bg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: r(999), backgroundColor: C.track },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  dotRow: { flexDirection: 'row', gap: 12 },
  accentHint: { fontFamily: F.body, fontSize: fs(12.5), lineHeight: fs(17), color: C.sub, marginTop: 10 },
  dotRing: { width: 40, height: 40, borderRadius: r(999), borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14 }, // literal half-size: Android squares off a 999 radius on a filled, borderless view
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  switchHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 2 },
}));
