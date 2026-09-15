import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { Bar, Card, Overline } from '@/components/ui';
import { freshness, lastPlayed } from '@/lib/movement-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

const daysSince = (key: string, today: string) => Math.round((new Date(today + 'T12:00:00').getTime() - new Date(key + 'T12:00:00').getTime()) / 86_400_000);

/** Performable today: pieces on the last stage, with a freshness bar that fades over 30 unplayed days. */
export function PerformableSection({ pieces, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();

  const last = store.stages.length - 1;
  const rows = pieces
    .filter((p) => p.stage >= last)
    .map((p) => {
      const played = lastPlayed(p, sessions);
      return { p, played, fresh: freshness(played, store.today) };
    })
    .sort((a, b) => b.fresh - a.fresh);
  if (rows.length === 0) return null;

  return (
    <Card style={{ gap: 12 }}>
      <View style={s.focusHead}>
        <Overline>{store.t('progress.performable')}</Overline>
        <Text style={s.skillLevel}>{store.t('progress.performableCount', { n: rows.filter((r) => r.fresh > 0).length, m: rows.length })}</Text>
      </View>
      {rows.map(({ p, played, fresh }) => (
        <Pressable key={p.id} style={{ gap: 6 }} onPress={() => router.push(`/piece/${p.id}`)}>
          <View style={s.focusHead}>
            <Text style={s.goalLabel} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={s.goalNote}>{played ? store.t('progress.lastPlayed', { days: daysSince(played, store.today) }) : store.t('progress.neverPlayed')}</Text>
          </View>
          <Bar pct={fresh * 100} color={fresh > 0.5 ? C.success : C.accent} height={6} />
        </Pressable>
      ))}
    </Card>
  );
}
