import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { chartSeries } from '@/lib/heatmap-math';
import { useStore } from '@/lib/store';

import { MinutesChart } from './minutes-chart';
import { usePeriod } from './period';
import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/** Minutes over the selected period, as a line or as bars — split from one card so each is its own toggle. */
function ChartSection({ mbd, sessions, kind }: SectionProps & { kind: 'line' | 'bars' }) {
  const s = useS();
  const store = useStore();
  const { period, picker } = usePeriod(sessions);
  const series = chartSeries(mbd, store.today, period);
  const total = series.reduce((a, pt) => a + pt.min, 0);
  return (
    <Card>
      <View style={s.monthHead}>
        {picker}
        <Text style={s.monthCount}>{fmtTime(total, store.t)}</Text>
      </View>
      <MinutesChart points={series} kind={kind} lang={store.lang} fmt={(m) => fmtTime(m, store.t)} empty={store.t('progress.chartEmpty')} emptyStyle={s.detailEmpty} />
    </Card>
  );
}

export const LineChartSection = (p: SectionProps) => <ChartSection {...p} kind="line" />;
export const BarChartSection = (p: SectionProps) => <ChartSection {...p} kind="bars" />;
