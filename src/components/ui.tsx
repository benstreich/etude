import React from 'react';
import { StyleSheet, Text, TextProps, View, ViewProps } from 'react-native';

import { C, F } from '@/lib/theme';

export const Card = ({ style, ...p }: ViewProps) => <View style={[s.card, style]} {...p} />;

export const Overline = ({ style, ...p }: TextProps) => <Text style={[s.overline, style]} {...p} />;

export const ScreenTitle = ({ style, ...p }: TextProps) => <Text style={[s.title, style]} {...p} />;

export const Bar = ({ pct, color = C.ink, height = 4 }: { pct: number; color?: string; height?: number }) => (
  <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }}>
    <View style={{ width: `${Math.min(100, pct)}%`, height, borderRadius: height / 2, backgroundColor: color }} />
  </View>
);

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 16,
    padding: 20,
  },
  overline: {
    fontFamily: F.bodySemi,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: C.tertiary,
  },
  title: {
    fontFamily: F.head,
    fontSize: 30,
    color: C.ink,
  },
});
