import React from 'react';
import { Platform, Pressable, StyleSheet, TextProps, View, ViewProps } from 'react-native';

import { Text } from '@/components/text';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

/**
 * KeyboardAvoidingView behavior for a bottom sheet inside a <Modal> (#39, #48).
 * On Android the window already resizes for the keyboard, so padding on top of
 * that lifts the sheet twice — the fix is to keep the KAV (it scrolls the focused
 * input into view) with no behavior at all, per Expo's keyboard-handling guide.
 * iOS never resizes, so there the sheet does need the padding.
 */
export const SHEET_AVOID = Platform.OS === 'ios' ? ('padding' as const) : undefined;

export const Card = ({ style, ...p }: ViewProps) => {
  const s = useS();
  return <View style={[s.card, style]} {...p} />;
};

export const Overline = ({ style, ...p }: TextProps) => {
  const s = useS();
  return <Text style={[s.overline, style]} {...p} />;
};

export const ScreenTitle = ({ style, ...p }: TextProps) => {
  const s = useS();
  return <Text style={[s.title, style]} {...p} />;
};

/** 1–5 star rating row (#54). Tapping the current value clears it; `onChange` omitted = read-only. */
export const Stars = ({ value, onChange, size = 28 }: { value?: number; onChange?: (v: number | undefined) => void; size?: number }) => {
  const C = useC();
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.25 }} accessibilityRole="adjustable" accessibilityValue={{ now: value ?? 0, min: 0, max: 5 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} hitSlop={4} onPress={() => onChange?.(value === n ? undefined : n)} accessibilityLabel={`${n}`}>
          <Text style={{ fontSize: size, lineHeight: size * 1.15, color: value !== undefined && n <= value ? C.accent : C.chartInactive }}>
            {value !== undefined && n <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

/**
 * All · Piano · Guitar segment (#58). Renders nothing with fewer than two
 * instruments; the choice is one shared setting so every tab shows the same slice.
 */
export const InstrumentFilter = ({ style }: { style?: ViewProps['style'] }) => {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (store.instruments.length < 2) return null;
  const sel = store.instruments.includes(store.instrumentFilter) ? store.instrumentFilter : '';
  return (
    <View style={[s.segTrack, style]}>
      {['', ...store.instruments].map((inst) => (
        <Pressable key={inst} style={[s.segBtn, sel === inst && s.segBtnSel]} onPress={() => store.updateSettings({ instrumentFilter: inst })}>
          <Text style={[s.segText, sel === inst && { color: C.ink }]} numberOfLines={1}>
            {inst || store.t('common.all')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

/** Current instrument filter, or '' when it is "All" or there is nothing to filter by. */
export const useInstrumentFilter = () => {
  const store = useStore();
  return store.instruments.length > 1 && store.instruments.includes(store.instrumentFilter) ? store.instrumentFilter : '';
};

export const Bar = ({ pct, color, height = 4 }: { pct: number; color?: string; height?: number }) => {
  const C = useC();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, pct)}%`, height, borderRadius: height / 2, backgroundColor: color ?? C.ink }} />
    </View>
  );
};

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  segTrack: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.track, borderRadius: r(999), padding: 2.5 },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: r(999), alignItems: 'center', justifyContent: 'center', maxWidth: 120 },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: r(16),
    padding: 20,
  },
  overline: {
    fontFamily: F.bodySemi,
    fontSize: fs(12),
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: C.tertiary,
  },
  title: {
    fontFamily: F.head,
    fontSize: fs(30),
    color: C.ink,
  },
}));
