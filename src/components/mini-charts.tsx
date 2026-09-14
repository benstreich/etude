// Small hand-drawn charts for the Insights card and the focus-drift card (#71).
// Same idiom as the tempo ladder and the rating trend: react-native-svg, a fixed
// viewBox stretched to the card width, no chart library.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polyline, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { F, themed, useC, type T } from '@/lib/theme';

const W = 240;

/** A handful of bars with a label under each; the tallest sets the scale. */
export function MiniBars({ values, labels, highlight }: { values: number[]; labels: string[]; highlight?: number }) {
  const s = useS();
  const C = useC();
  const max = Math.max(1, ...values);
  const n = values.length;
  const slot = W / n;
  return (
    <View>
      <Svg width="100%" height={44} viewBox={`0 0 ${W} 44`} preserveAspectRatio="none">
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * 40);
          return <Rect key={i} x={i * slot + slot * 0.15} y={42 - h} width={slot * 0.7} height={h} rx={2} fill={i === highlight ? C.accent : C.track} />;
        })}
      </Svg>
      <View style={s.labels}>
        {labels.map((l, i) => (
          <Text key={i} style={[s.label, { width: `${100 / n}%` }]} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Weekly totals as bars with a trailing mean drawn over them; the last bar is the current week. */
export function MiniTrend({ values, mean }: { values: number[]; mean: (number | null)[] }) {
  const C = useC();
  const max = Math.max(1, ...values, ...mean.map((m) => m ?? 0));
  const n = values.length;
  const slot = W / n;
  const y = (v: number) => 42 - (v / max) * 40;
  return (
    <Svg width="100%" height={44} viewBox={`0 0 ${W} 44`} preserveAspectRatio="none">
      {values.map((v, i) => (
        <Rect key={i} x={i * slot + slot * 0.2} y={y(v)} width={slot * 0.6} height={Math.max(0, 42 - y(v))} rx={2} fill={i === n - 1 ? C.accentTint : C.track} />
      ))}
      <Polyline
        points={mean.map((m, i) => (m === null ? null : `${i * slot + slot / 2},${y(m)}`)).filter(Boolean).join(' ')}
        fill="none"
        stroke={C.accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Stacked weekly shares, one column per week, one colour per series. */
export function StackedShares({ series, colors }: { series: { share: number[] }[]; colors: string[] }) {
  const n = series[0]?.share.length ?? 0;
  const slot = W / Math.max(1, n);
  return (
    <Svg width="100%" height={96} viewBox={`0 0 ${W} 96`} preserveAspectRatio="none">
      {Array.from({ length: n }, (_, w) => {
        let top = 0;
        return series.map((sr, k) => {
          const h = sr.share[w] * 92;
          const rect = <Rect key={`${w}-${k}`} x={w * slot + slot * 0.15} y={94 - top - h} width={slot * 0.7} height={h} fill={colors[k % colors.length]} />;
          top += h;
          return rect;
        });
      })}
    </Svg>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  labels: { flexDirection: 'row', marginTop: 2 },
  label: { fontFamily: F.body, fontSize: fs(10.5), color: C.tertiary, textAlign: 'center' },
}));
