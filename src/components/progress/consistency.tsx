import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { consistency } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

/** Practice days per week over the last 12 weeks. */
export function ConsistencySection({ sessions, mbd, monday }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (sessions.length === 0) return null;
  const cons = consistency(mbd, store.today, monday);
  return (
    <Card>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.consistency')}</Overline>
        <Text style={s.skillLevel}>{store.t('progress.avgDaysPerWeek', { n: cons.average })}</Text>
      </View>
      <View style={[s.chart, { height: 56 }]}>
        {cons.perWeek.map((d, i) => (
          <View key={i} style={s.col}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <View style={{ height: `${Math.max(4, (d / 7) * 100)}%`, backgroundColor: i === cons.perWeek.length - 1 ? C.accent : C.track, borderRadius: 3 }} />
            </View>
          </View>
        ))}
      </View>
      <Text style={[s.detailEmpty, { marginTop: 10 }]}>{store.t('progress.daysThisWeek', { n: cons.current })}</Text>
    </Card>
  );
}
