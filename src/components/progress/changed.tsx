import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { monthDiff } from '@/lib/movement-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

const fmt = (v: number | null, digits = 0) => (v === null ? '—' : v.toFixed(digits));
const delta = (cur: number | null, prev: number | null, digits = 0) => {
  if (cur === null || prev === null) return '';
  const d = cur - prev;
  if (Math.abs(d) < 10 ** -digits / 2) return '±0';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`;
};

/** Since last month: release notes for your playing — this month to date against the same days last month. */
export function ChangedSection({ pieces, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (sessions.length === 0 && pieces.length === 0) return null;

  const d = monthDiff(pieces, sessions, store.today);
  const rows: [string, string, string][] = [
    [store.t('progress.changedPieces'), fmt(d.pieces[0]), delta(d.pieces[0], d.pieces[1])],
    [store.t('progress.changedPromoted'), fmt(d.promoted[0]), delta(d.promoted[0], d.promoted[1])],
    [store.t('progress.changedHours'), fmt(d.hours[0], 1), delta(d.hours[0], d.hours[1], 1)],
    [store.t('progress.changedBpm'), fmt(d.bpm[0]), delta(d.bpm[0], d.bpm[1])],
    [store.t('progress.changedStars'), fmt(d.stars[0], 1), delta(d.stars[0], d.stars[1], 1)],
  ];

  return (
    <Card>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.sinceLastMonth')}</Overline>
        <Text style={s.skillLevel}>{store.t('progress.changedDay', { day: Number(store.today.slice(8)) })}</Text>
      </View>
      {rows.map(([label, value, diff]) => (
        <View key={label} style={s.bucketRow}>
          <Text style={s.bucketLabel}>{label}</Text>
          <Text style={s.goalValue}>{value}</Text>
          <Text style={[s.bucketStars, { color: diff.startsWith('+') ? C.success : diff.startsWith('−') ? C.accent : C.sub }]}>{diff}</Text>
        </View>
      ))}
    </Card>
  );
}
