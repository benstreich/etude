import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Bar, Card, Overline } from '@/components/ui';
import { ratingByFocus } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, stars, useS } from './styles';
import type { SectionProps } from './types';

/** Minutes (and average stars) per piece or technique inside the selected period. */
export function TimeByFocusSection({ sessions, inPeriod }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (sessions.length === 0) return null;
  const focusRows = ratingByFocus(inPeriod);
  const focusMax = focusRows[0]?.min ?? 1;
  return (
    <Card>
      <Overline style={{ marginBottom: 4 }}>{store.t('progress.timeByFocus')}</Overline>
      {focusRows.length === 0 && <Text style={s.detailEmpty}>{store.t('progress.nothingInPeriod')}</Text>}
      {focusRows.map((f) => (
        <View key={f.title} style={{ marginTop: 16 }}>
          <View style={s.skillRow}>
            <Text style={s.skillName}>{f.title}</Text>
            <Text style={s.skillLevel}>
              {f.avgRating !== null && <Text style={{ color: C.accent }}>{stars(f.avgRating)} · </Text>}
              {fmtTime(f.min, store.t)}
            </Text>
          </View>
          <Bar pct={(f.min / focusMax) * 100} />
        </View>
      ))}
    </Card>
  );
}
