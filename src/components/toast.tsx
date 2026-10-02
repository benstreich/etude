import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import { Text } from '@/components/text';
import { useStore } from '@/lib/store';
import { F, themed, useTheme, type T } from '@/lib/theme';

/**
 * `bottom` clears whatever sits under it (tab bar, RunPill, home indicator).
 * A Modal is its own window above the app's, so a sheet renders its own copy
 * (`inModal`): that copy stays quiet, the root one already announced it.
 */
export function Toast({ bottom = 96, inModal = false }: { bottom?: number; inModal?: boolean }) {
  const s = useS();
  const { reduceMotion } = useTheme();
  const { toast } = useStore();
  // state, not ref: the value object is stable and reading it in render is compiler-legal
  const [anim] = useState(() => new Animated.Value(0));
  // the text outlives `toast` by the fade-out, or the pill would just vanish
  const [shown, setShown] = useState(toast);
  if (toast && toast !== shown) setShown(toast);

  useEffect(() => {
    if (toast && !inModal) AccessibilityInfo.announceForAccessibility(toast);
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !toast) setShown(null);
    });
  }, [toast, anim, reduceMotion, inModal]);

  if (!shown) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.pill,
        { bottom },
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}>
      <Text style={s.text}>{shown}</Text>
    </Animated.View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    marginHorizontal: 24,
    backgroundColor: C.ink,
    borderRadius: r(12),
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  text: { color: C.bg, fontFamily: F.bodyMed, fontSize: fs(14), textAlign: 'center' },
}));
