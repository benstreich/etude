import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { F, themed, useTheme, type T } from '@/lib/theme';
import { useStore } from '@/lib/store';

export function Toast() {
  const s = useS();
  const { reduceMotion } = useTheme();
  const { toast } = useStore();
  // state, not ref: the value object is stable and reading it in render is compiler-legal
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }).start();
  }, [toast, anim, reduceMotion]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.pill,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}>
      <Text style={s.text}>{toast}</Text>
    </Animated.View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    backgroundColor: C.ink,
    borderRadius: r(12),
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  text: { color: C.bg, fontFamily: F.bodyMed, fontSize: fs(14) },
}));
