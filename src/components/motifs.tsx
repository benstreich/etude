// Musical motifs from the soul pass: progress drawn as notation instead of as
// a ring or a pill row. Both draw in on mount and then sit still — the whole
// motion budget for these screens.
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type TextStyle } from 'react-native';
import Svg, { Ellipse, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { barlines, tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const STAFF_W = 284;
const STAFF_H = 33;
const GAP = 8; // five 1px rules, 8px apart

/** Width animated 0→pct on mount; instant when reduce-motion is on. */
function useDraw(duration: number) {
  const { reduceMotion } = useTheme();
  const [v] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (!reduceMotion) Animated.timing(v, { toValue: 1, duration, useNativeDriver: false }).start();
  }, [reduceMotion, duration, v]);
  return v;
}

/**
 * Session review — five staff rules with the progress line drawn along the
 * middle one, ending in a quarter note. `pct` may exceed 100 (goal beaten);
 * the line clamps at the staff's width.
 */
export function StaffProgress({ pct }: { pct: number }) {
  const C = useC();
  const draw = useDraw(1100);
  const w = (Math.min(100, Math.max(0, pct)) / 100) * STAFF_W;
  return (
    <View style={{ width: STAFF_W, height: STAFF_H }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * GAP, height: 1, backgroundColor: C.staffLine }} />
      ))}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 2 * GAP - 1, // centred on the middle rule
          height: 3,
          borderRadius: 2,
          backgroundColor: C.accent,
          width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
        }}>
        <Svg width={15} height={24} viewBox="0 0 15 24" style={{ position: 'absolute', right: -7, top: -19 }}>
          <Ellipse cx={6} cy={19} rx={5.6} ry={4} transform="rotate(-20 6 19)" fill={C.accent} />
          <Rect x={10.6} y={2} width={1.6} height={17.5} rx={0.8} fill={C.accent} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Plan runner — the run drawn as a measure: a baseline with a barline at each
 * segment boundary and a double barline at the end. `done` is the fraction of
 * the whole plan completed.
 */
export function MeasureBar({ segments, done }: { segments: number[]; done: number }) {
  const C = useC();
  const draw = useDraw(900);
  const bars = barlines(segments);
  return (
    <View style={{ height: 16, marginTop: 6 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 7.5, height: 1, backgroundColor: C.staffLine }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 6.5,
          height: 3,
          borderRadius: 2,
          backgroundColor: C.accent,
          width: draw.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.min(100, Math.max(0, done * 100))}%`] }),
        }}
      />
      {bars.map((f, i) => (
        <View key={i} style={{ position: 'absolute', left: `${f * 100}%`, top: 1, width: 1.5, height: 14, backgroundColor: C.barline }} />
      ))}
      <View style={{ position: 'absolute', right: 4, top: 1, width: 1.5, height: 14, backgroundColor: C.barline }} />
      <View style={{ position: 'absolute', right: 0, top: 1, width: 3, height: 14, backgroundColor: C.sub }} />
    </View>
  );
}

/** "Andante · 84 BPM" — term in the accent serif, the rest in the caller's style. */
export function Tempo({ bpm, size = 13 }: { bpm: number; size?: number }) {
  const s = useS();
  const { fs } = useTheme();
  return (
    <Text style={[s.tempoRow, { fontSize: fs(size) }]}>
      <Text style={[s.term, { fontSize: fs(size + 1) }]}>{tempoTerm(bpm)}</Text>
      {` · ${bpm} BPM`}
    </Text>
  );
}

/**
 * The metronome chip's dot, pulsing one beat per 60/bpm seconds. `on` false
 * leaves it static — the chip also shows a tempo the metronome isn't playing.
 */
export function TickDot({ bpm, on, color }: { bpm: number; on: boolean; color: string }) {
  const { reduceMotion } = useTheme();
  const [v] = useState(() => new Animated.Value(0));
  const period = Math.max(120, (60 / Math.max(1, bpm)) * 1000);
  useEffect(() => {
    v.setValue(0);
    if (!on || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period / 2, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: period / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, period, reduceMotion, v]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
      }}
    />
  );
}

/** "Attach take" — six bars of a waveform, replacing the old record dot. */
export function WaveformIcon({ color, width = 22 }: { color?: string; width?: number }) {
  const C = useC();
  const fill = color ?? C.accent;
  const bars: [x: number, y: number, h: number][] = [
    [0, 6, 4], [4, 3, 10], [8, 0, 16], [12, 4, 8], [16, 1.5, 13], [20, 5.5, 5],
  ];
  return (
    <Svg width={width} height={(width / 22) * 16} viewBox="0 0 22 16">
      {bars.map(([x, y, h]) => (
        <Rect key={x} x={x} y={y} width={2} height={h} rx={1} fill={fill} />
      ))}
    </Svg>
  );
}

const useS = themed(({ C }: T) => StyleSheet.create({
  tempoRow: { fontFamily: F.body, color: C.subStrong },
  term: { fontFamily: F.accentMed, color: C.accent },
}));

/**
 * Odometer digits (#44) — each column rolls to its new value instead of the
 * number cutting. `height` must be the text's line height, since that is the
 * distance one digit travels. Digits only, so tabular figures keep it steady.
 */
export function RollingNumber({ value, style, height }: { value: number; style?: TextStyle; height: number }) {
  const chars = String(value).split('');
  return (
    <View style={{ flexDirection: 'row', height, overflow: 'hidden' }}>
      {chars.map((c, i) => (
        // keyed by position: digit 3 stays digit 3 as the number changes, so the
        // column rolls rather than being torn down and rebuilt at the new value
        <Digit key={`${chars.length}-${i}`} digit={Number(c)} style={style} height={height} />
      ))}
    </View>
  );
}

function Digit({ digit, style, height }: { digit: number; style?: TextStyle; height: number }) {
  const { reduceMotion } = useTheme();
  const [y] = useState(() => new Animated.Value(-digit * height));
  useEffect(() => {
    const to = -digit * height;
    if (reduceMotion) return y.setValue(to);
    Animated.spring(y, { toValue: to, useNativeDriver: true, friction: 9, tension: 70 }).start();
  }, [digit, height, reduceMotion, y]);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Text key={n} style={[style, { height, lineHeight: height, textAlign: 'center' }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}
