import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { byLength, byTimeOfDay, MIN_RATED, rated, TIME_OF_DAY, type Bucket } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, stars, useS } from './styles';
import type { SectionProps } from './types';

/** One line of a bucket card: label, count/minutes, average rating. */
function BucketRow({ label, b, value }: { label: string; b: Bucket; value: string }) {
  const s = useS();
  const C = useC();
  return (
    <View style={s.bucketRow}>
      <Text style={[s.bucketLabel, b.n === 0 && { color: C.tertiary }]}>{label}</Text>
      <Text style={s.skillLevel}>{b.n === 0 ? '—' : value}</Text>
      <Text style={[s.bucketStars, { color: b.avgRating === null ? C.tertiary : C.accent }]}>{stars(b.avgRating)}</Text>
    </View>
  );
}

// both cards hide below MIN_RATED rated sessions in the period rather than showing noise (#54)

/** Minutes and average stars by morning / afternoon / evening. */
export function TimeOfDaySection({ inPeriod }: SectionProps) {
  const store = useStore();
  if (rated(inPeriod).length < MIN_RATED) return null;
  const buckets = byTimeOfDay(inPeriod);
  return (
    <Card>
      <Overline style={{ marginBottom: 12 }}>{store.t('progress.bestTimeOfDay')}</Overline>
      {buckets.map((b, i) => (
        <BucketRow key={b.label} label={store.t(`progress.${TIME_OF_DAY[i]}`)} b={b} value={fmtTime(b.min, store.t)} />
      ))}
    </Card>
  );
}

/** Session count and average stars by session length. */
export function SessionLengthSection({ inPeriod }: SectionProps) {
  const store = useStore();
  if (rated(inPeriod).length < MIN_RATED) return null;
  return (
    <Card>
      <Overline style={{ marginBottom: 12 }}>{store.t('progress.sessionLength')}</Overline>
      {byLength(inPeriod).map((b) => (
        <BucketRow key={b.label} label={b.label} b={b} value={String(b.n)} />
      ))}
    </Card>
  );
}
