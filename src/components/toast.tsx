import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { C, F } from '@/lib/theme';
import { useStore } from '@/lib/store';

export function Toast() {
  const { toast } = useStore();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: toast ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [toast, anim]);

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

const s = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  text: { color: C.bg, fontFamily: F.bodyMed, fontSize: 14 },
});
