import React from 'react';
import { StyleSheet, Text, TextProps, View, ViewProps } from 'react-native';

import { F, themed, useC, type T } from '@/lib/theme';

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

export const Bar = ({ pct, color, height = 4 }: { pct: number; color?: string; height?: number }) => {
  const C = useC();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, pct)}%`, height, borderRadius: height / 2, backgroundColor: color ?? C.ink }} />
    </View>
  );
};

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
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
