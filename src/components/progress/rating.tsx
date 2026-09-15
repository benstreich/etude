import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { pieceRatings, rollingAvg } from '@/lib/rating-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { stars, useS } from './styles';
import type { SectionProps } from './types';

const POINTS = 12;

/** Rating over time, per piece: the rolling average after each rated session. A global average would blend a study with a sonata. */
export function RatingSection({ pieces, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [sel, setSel] = useState<string | null>(null);

  const rated = pieces
    .map((p) => ({ p, r: pieceRatings(p, sessions) }))
    .filter((x) => x.r.length >= 2)
    .sort((a, b) => b.r.length - a.r.length);
  if (rated.length === 0) return null;
  const cur = rated.find((x) => x.p.id === sel) ?? rated[0];
  // the rolling average after each session, last POINTS sessions
  const series = cur.r.map((_, i) => rollingAvg(cur.r.slice(0, i + 1)) ?? cur.r[i].rating).slice(-POINTS);
  const step = 240 / Math.max(1, series.length - 1);
  const y = (v: number) => 88 - ((v - 1) / 4) * 80;

  return (
    <Card>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.ratingOverTime')}</Overline>
        <Text style={[s.skillLevel, { color: C.accent }]}>{stars(rollingAvg(cur.r))}</Text>
      </View>
      <View style={s.chipRow}>
        {rated.map(({ p }) => (
          <Pressable key={p.id} style={[s.chip, p.id === cur.p.id && s.chipSel]} onPress={() => setSel(p.id)}>
            <Text style={[s.chipText, p.id === cur.p.id && { color: C.accent }]} numberOfLines={1}>
              {p.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Svg width="100%" height={96} viewBox="0 0 240 96" preserveAspectRatio="none">
        {series.length > 1 && (
          <Polyline points={series.map((v, i) => `${i * step},${y(v)}`).join(' ')} fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" />
        )}
        {series.map((v, i) => (
          <Circle key={i} cx={series.length > 1 ? i * step : 120} cy={y(v)} r={3} fill={C.accent} />
        ))}
      </Svg>
      <Text style={s.detailEmpty}>{store.t('progress.ratingSessions', { n: cur.r.length })}</Text>
    </Card>
  );
}
