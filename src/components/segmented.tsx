// One segmented control for the app: a single thumb that slides between cells
// on a spring, a selection tick under the finger. Cells are measured, so labels
// of any language or width work; `grow` stretches it to the row.
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { F, themed, useTheme, type T } from '@/lib/theme';

const SPRING = { damping: 18, stiffness: 240, mass: 0.7 };

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  grow,
  style,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** Fill the row with equal cells instead of hugging the labels. */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useS();
  const { reduceMotion } = useTheme();
  const [widths, setWidths] = useState<number[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const left = widths.slice(0, idx).reduce((a, w) => a + w, 0);
  const width = widths[idx] ?? 0;
  const ready = widths.length === options.length && widths.every((w) => w > 0);

  const x = useSharedValue(left);
  const w = useSharedValue(width);
  useEffect(() => {
    if (!ready) return;
    if (reduceMotion || w.value === 0) {
      x.value = left;
      w.value = width;
    } else {
      x.value = withSpring(left, SPRING);
      w.value = withSpring(width, SPRING);
    }
  }, [left, width, ready, reduceMotion, x, w]);
  const thumb = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));

  return (
    <View style={[s.track, grow && s.trackGrow, style]} accessibilityRole="tablist">
      {ready && <Animated.View style={[s.thumb, thumb]} />}
      {options.map((o, i) => {
        const sel = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={[s.cell, grow && s.cellGrow]}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onLayout={(e) => {
              const cw = e.nativeEvent.layout.width;
              setWidths((prev) => (prev[i] === cw ? prev : Object.assign([...prev], { [i]: cw })));
            }}
            onPress={() => {
              if (sel) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}>
            <Text style={[s.text, sel && s.textSel]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  track: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.track, borderRadius: r(999), padding: 3 },
  trackGrow: { alignSelf: 'stretch' },
  thumb: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: r(999),
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cell: { height: 32, paddingHorizontal: 16, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
  cellGrow: { flex: 1, paddingHorizontal: 8 },
  text: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub },
  textSel: { color: C.ink },
}));
