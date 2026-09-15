import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { dateKey, useStore } from '@/lib/store';

import { useS } from './styles';
import type { SectionProps } from './types';

/** Volume in one row: this calendar week, average per practised day, all time. The old three tiles, compressed. */
export function VolumeSection({ mbd, monday, sessions, inst }: SectionProps) {
  const s = useS();
  const store = useStore();
  const empty = store.totalMin === 0 && sessions.length === 0;

  // calendar week honoring "Week starts on"; anchored on store.now so it follows the calendar
  const start = monday ? 1 : 0;
  const elapsed = ((new Date(store.now).getDay() - start + 7) % 7) + 1;
  let weekTotal = 0;
  let weekPracticed = 0; // avg divides by practised days only — zero days would dilute it (#25)
  for (let i = 0; i < elapsed; i++) {
    const d = new Date(store.now);
    d.setDate(d.getDate() - i);
    const min = mbd[dateKey(d)] ?? 0;
    weekTotal += min;
    if (min > 0) weekPracticed++;
  }
  const allMin = inst ? sessions.reduce((a, x) => a + x.min, 0) : store.totalMin;

  const cells: [string, string, string][] = [
    [store.t('progress.thisWeek'), String(weekTotal), store.t('progress.minUnit')],
    [store.t('progress.avgPerDay'), empty ? '—' : String(Math.round(weekTotal / Math.max(1, weekPracticed))), empty ? '' : store.t('progress.minUnit')],
    [store.t('progress.allTime'), String(Math.floor(allMin / 60)), store.t('progress.hrUnit')],
    [store.t('settings.bestStreak'), String(store.bestStreak), store.t('settings.daysUnit')],
  ];

  return (
    <Card>
      <View style={s.volumeRow}>
        {cells.map(([label, num, unit]) => (
          <View key={label} style={s.volumeCell}>
            <Overline>{label}</Overline>
            <Text style={s.volumeNum}>
              {num}
              {!!unit && <Text style={s.volumeUnit}> {unit}</Text>}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
