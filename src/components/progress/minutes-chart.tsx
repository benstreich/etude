// Minutes over the selected period as bars or a line, with the axes a chart
// needs to be read: three gridlines labelled in minutes on the left, dates along
// the bottom. Bars grow up from the baseline and the line draws itself in; both
// are one shared progress value, so a period change replays the reveal.
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/text';
import type { ChartPoint } from '@/lib/heatmap-math';
import { F, themed, useTheme, type T } from '@/lib/theme';

const H = 120; // plot height
const GUTTER = 34; // y-axis label column
const TICKS = 5; // x labels, first and last included

const APolyline = Animated.createAnimatedComponent(Polyline);
const APolygon = Animated.createAnimatedComponent(Polygon);
const ACircle = Animated.createAnimatedComponent(Circle);

/** Round the top of the axis up to a value the eye can divide: tens of minutes, then whole hours. */
export const niceMax = (max: number) => (max <= 120 ? Math.max(10, Math.ceil(max / 10) * 10) : Math.ceil(max / 60) * 60);

/** "45m", "1h", "1.5h" — short enough for a 34-point gutter. */
export const fmtAxis = (min: number) => (min < 60 ? `${min}m` : min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);

/** Indices of the x labels: every day of a week, otherwise first, last and evenly spaced between. */
export const tickIndices = (n: number) => {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: TICKS }, (_, i) => Math.round((i * (n - 1)) / (TICKS - 1)));
};

export function MinutesChart({
  points,
  kind,
  lang,
  empty,
  emptyStyle,
}: {
  points: ChartPoint[];
  kind: 'line' | 'bars';
  lang: string;
  empty: string;
  emptyStyle: StyleProp<TextStyle>;
}) {
  const s = useS();
  const { C, reduceMotion } = useTheme();
  const [w, setW] = useState(0);
  const n = points.length;
  const top = niceMax(Math.max(...points.map((p) => p.min), 0));

  // one reveal per data set: 0 → 1, replayed when the period or the view changes
  const p = useSharedValue(reduceMotion ? 1 : 0);
  const dataKey = `${kind}:${n}:${points[0]?.label}`;
  useEffect(() => {
    if (reduceMotion) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withTiming(1, { duration: 650, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [dataKey, reduceMotion, p]);

  if (n === 0) return <Text style={emptyStyle}>{empty}</Text>;

  const slot = w / n;
  const x = (i: number) => (n === 1 ? w / 2 : slot * i + slot / 2);
  const y = (min: number) => H - (min / top) * H;
  const fmtDate = (label: string) =>
    new Date(label + 'T12:00:00').toLocaleDateString(lang, n <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <View style={s.gutter}>
          {[top, top / 2, 0].map((v) => (
            <Text key={v} style={s.yLabel}>
              {fmtAxis(v)}
            </Text>
          ))}
        </View>
        <View style={s.plot} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {[0, 0.5, 1].map((f) => (
            <View key={f} style={[s.grid, { top: f * H - (f === 1 ? 1 : 0), backgroundColor: f === 1 ? C.inputBorder : C.hairline }]} />
          ))}
          {w > 0 && kind === 'bars' && (
            <View style={s.bars}>
              {points.map((pt, i) => (
                <Bar key={pt.label} h={Math.max(2, (pt.min / top) * H)} color={pt.min > 0 ? (i === n - 1 ? C.accent : C.accentDark) : C.track} p={p} />
              ))}
            </View>
          )}
          {w > 0 && kind === 'line' && <Line points={points} x={x} y={y} p={p} accent={C.accent} tint={C.accentTint} width={w} />}
        </View>
      </View>
      <View style={[s.xRow, { marginLeft: GUTTER }]}>
        {w > 0 &&
          tickIndices(n).map((i) => {
            const first = i === 0;
            const last = i === n - 1;
            return (
              <Text
                key={i}
                numberOfLines={1}
                style={[s.xLabel, first ? { left: 0, textAlign: 'left' } : last ? { right: 0, textAlign: 'right' } : { left: x(i) - 30, width: 60, textAlign: 'center' }]}>
                {fmtDate(points[i].label)}
              </Text>
            );
          })}
      </View>
    </View>
  );
}

function Bar({ h, color, p }: { h: number; color: string; p: SharedValue<number> }) {
  const s = useS();
  // scale from the baseline: shrink about the centre, then push the centre down by the missing half
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (h * (1 - p.value)) / 2 }, { scaleY: p.value }] }));
  return (
    <View style={s.barSlot}>
      <Animated.View style={[s.bar, { height: h, backgroundColor: color }, style]} />
    </View>
  );
}

function Line({
  points,
  x,
  y,
  p,
  accent,
  tint,
  width,
}: {
  points: ChartPoint[];
  x: (i: number) => number;
  y: (min: number) => number;
  p: SharedValue<number>;
  accent: string;
  tint: string;
  width: number;
}) {
  const coords = useMemo(() => points.map((pt, i) => [x(i), y(pt.min)] as const), [points, x, y]);
  const path = coords.map(([cx, cy]) => `${cx},${cy}`).join(' ');
  // stroke length, so the dash can start fully hidden and be reeled out
  const len = coords.reduce((a, c, i) => (i === 0 ? 0 : a + Math.hypot(c[0] - coords[i - 1][0], c[1] - coords[i - 1][1])), 0) + 1;
  const last = coords[coords.length - 1];

  const stroke = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  const fill = useAnimatedProps(() => ({ opacity: p.value }));
  const dot = useAnimatedProps(() => ({ opacity: p.value > 0.95 ? (p.value - 0.95) * 20 : 0 }));

  return (
    <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
      <APolygon animatedProps={fill} points={`${coords[0][0]},${H} ${path} ${last[0]},${H}`} fill={tint} />
      <APolyline animatedProps={stroke} points={path} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={[len, len]} />
      <ACircle animatedProps={dot} cx={last[0]} cy={last[1]} r={4} fill={accent} />
    </Svg>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row' },
  // labels centred on their gridlines: half a line taller than the plot, shifted up half a line
  gutter: { width: GUTTER, height: H + fs(12), marginTop: -fs(6), justifyContent: 'space-between', paddingRight: 8 },
  yLabel: { fontFamily: F.bodyMed, fontSize: fs(10.5), lineHeight: fs(12), color: C.tertiary, textAlign: 'right' },
  plot: { flex: 1, height: H },
  grid: { position: 'absolute', left: 0, right: 0, height: 1 },
  bars: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: H, paddingHorizontal: 1 },
  bar: { width: '100%', maxWidth: 22, borderTopLeftRadius: r(3), borderTopRightRadius: r(3) },
  xRow: { height: fs(16), marginTop: 6 },
  xLabel: { position: 'absolute', fontFamily: F.bodyMed, fontSize: fs(10.5), color: C.tertiary },
}));
