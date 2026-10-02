import React from 'react';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { chartSeries } from '@/lib/heatmap-math';
import { useStore } from '@/lib/store';

import { MinutesChart } from './minutes-chart';
import { PeriodHead, usePeriod } from './period';
import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/** Minutes over the selected period, as a line or as bars — split from one card so each is its own toggle. */
function ChartSection({ mbd, sessions, kind }: SectionProps & { kind: 'line' | 'bars' }) {
  const s = useS();
  const store = useStore();
  const { period, picker } = usePeriod(sessions);
  const series = chartSeries(mbd, store.today, period);
  // 'all' draws at most a year of weekly buckets, but its total is the whole history — the same figure as Volume's all-time
  const total = period === 'all' ? Object.keys(mbd).reduce((a, k) => (k <= store.today ? a + (mbd[k] ?? 0) : a), 0) : series.reduce((a, pt) => a + pt.min, 0);
  return (
    <Card>
      <PeriodHead title={store.t(kind === 'line' ? 'progress.section.lineChart' : 'progress.section.barChart')} picker={picker} />
      <Text style={[s.monthCount, { marginTop: 6, marginBottom: 14 }]}>{fmtTime(total, store.t)}</Text>
      <MinutesChart points={series} kind={kind} lang={store.lang} fmt={(m) => fmtTime(m, store.t)} empty={store.t('progress.chartEmpty')} emptyStyle={s.detailEmpty} />
    </Card>
  );
}

export const LineChartSection = (p: SectionProps) => <ChartSection {...p} kind="line" />;
export const BarChartSection = (p: SectionProps) => <ChartSection {...p} kind="bars" />;
