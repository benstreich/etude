import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { mix } from '@/lib/heatmap-math';
import { pipelineCounts } from '@/lib/movement-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

/** Repertoire pipeline: how many pieces sit in each stage, and the flow into the last one. */
export function PipelineSection({ pieces }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (pieces.length === 0) return null;

  const n = store.stages.length;
  const { perStage, readyThisMonth, readyLastMonth } = pipelineCounts(pieces, n, store.today);
  const total = perStage.reduce((a, b) => a + b, 0);
  // light for the first stage, accent for the last — the same ramp the heatmap uses
  const colors = store.stages.map((_, i) => (n === 1 ? C.accent : mix(C.track, C.accent, i / (n - 1))));

  return (
    <Card>
      <Overline style={{ marginBottom: 12 }}>{store.t('progress.pipelineTitle')}</Overline>
      <View style={s.pipeBar}>
        {perStage.map((c, i) => (c > 0 ? <View key={i} style={{ flex: c, backgroundColor: colors[i] }} /> : null))}
      </View>
      <View style={s.pipeLegend}>
        {store.stages.map((label, i) => (
          <View key={label} style={s.pipeItem}>
            <View style={[s.legendSwatch, { backgroundColor: colors[i] }]} />
            <Text style={s.legendText} numberOfLines={1}>
              {label} · {perStage[i]}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.goalNote, { marginTop: 10 }]}>
        {store.t('progress.pipelineReady', { n: readyThisMonth, stage: store.stages[n - 1], m: readyLastMonth })}
        {total > 0 && ` · ${store.t('progress.pipelineTotal', { n: total })}`}
      </Text>
    </Card>
  );
}
