import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Pressable } from '@/components/press';

import { RecordingsList } from '@/components/recordings';
import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { recordingPair } from '@/lib/movement-math';
import { useStore } from '@/lib/store';

import { useS } from './styles';
import type { SectionProps } from './types';

const MAX_PIECES = 3;
const daysApart = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);

/** Hear the difference: the first and the latest recording of a piece, side by side. Progress you can listen to. */
export function HearSection({ pieces }: SectionProps) {
  const s = useS();
  const store = useStore();
  const router = useRouter();

  const rows = pieces
    .map((p) => ({ p, pair: recordingPair(store.recordings.filter((r) => r.piece === p.name)) }))
    .filter((x): x is { p: (typeof pieces)[number]; pair: NonNullable<typeof x.pair> } => x.pair !== null)
    .sort((a, b) => (a.pair[1].date < b.pair[1].date ? 1 : -1))
    .slice(0, MAX_PIECES);
  if (rows.length === 0) return null;

  return (
    <Card style={{ gap: 14 }}>
      <Overline>{store.t('progress.hearTitle')}</Overline>
      {rows.map(({ p, pair }) => (
        <View key={p.id} style={{ gap: 4 }}>
          <Pressable style={s.focusHead} onPress={() => router.push(`/piece/${p.id}`)}>
            <Text style={s.skillName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={s.skillLevel}>{store.t('progress.hearDays', { days: daysApart(pair[0].date, pair[1].date) })}</Text>
          </Pressable>
          <RecordingsList recordings={pair} />
        </View>
      ))}
    </Card>
  );
}
