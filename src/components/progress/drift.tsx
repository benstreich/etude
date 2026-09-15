import React from 'react';
import { View } from 'react-native';

import { StackedShares } from '@/components/mini-charts';
import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { mix } from '@/lib/heatmap-math';
import { focusDrift } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

/** Share of time per focus, week by week — a focus being neglected shows here weeks before it goes stale (#71). */
export function DriftSection({ sessions, monday }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const drift = focusDrift(sessions, store.today, monday);
  if (!drift) return null;
  const colors = [C.accent, C.accentDark, mix(C.accent, C.bg, 0.35), mix(C.accent, C.bg, 0.65), C.track];
  return (
    <Card>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.drift')}</Overline>
        <Text style={s.skillLevel}>{store.t('progress.last12Weeks')}</Text>
      </View>
      <StackedShares series={drift.series} colors={colors} />
      <View style={s.driftLegend}>
        {drift.series.map((sr, i) => (
          <View key={sr.title || '_other'} style={s.driftItem}>
            <View style={[s.legendSwatch, { backgroundColor: colors[i % colors.length] }]} />
            <Text style={s.legendText} numberOfLines={1}>
              {sr.title || store.t('progress.other')}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
