import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { dateKey, useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/** Minutes per day over the rolling last seven days, today at the right. */
export function Last7Section({ mbd, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (sessions.length === 0) return null;
  const letters = store.t('common.dayLetters').split('');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(store.now);
    d.setDate(d.getDate() - (6 - i));
    return { key: dateKey(d), letter: letters[d.getDay()], min: mbd[dateKey(d)] ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.min));
  const total = days.reduce((a, d) => a + d.min, 0);
  return (
    <Card>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.last7Days')}</Overline>
        <Text style={s.skillLevel}>{fmtTime(total, store.t)}</Text>
      </View>
      <View style={[s.chart, { height: 90, marginTop: 8 }]}>
        {days.map((d, i) => (
          <View key={d.key} style={s.col}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <View style={{ height: `${Math.max(3, (d.min / max) * 100)}%`, backgroundColor: i === 6 ? C.accent : d.min > 0 ? C.accentTint : C.track, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
            </View>
            <Text style={s.colLabel}>{d.letter}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
