import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { pieceMovement, rankMovement, type Movement } from '@/lib/movement-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

import type { SectionProps } from './types';

const MAX_ROWS = 5;

export const chipKey = (m: Movement) =>
  m.kind === 'stage' ? 'progress.moveStage' : m.kind === 'tempo' ? 'progress.moveTempo' : m.kind === 'rating' ? 'progress.moveRating' : m.kind === 'stalled' ? 'progress.moveStalled' : m.kind === 'due' ? 'progress.moveDue' : 'progress.moveNew';
export const chipArgs = (m: Movement, stages: string[]) =>
  m.kind === 'stage' ? { from: stages[m.from] ?? m.from + 1, to: stages[m.to] ?? m.to + 1 } : m.kind === 'tempo' ? { n: m.deltaBpm } : m.kind === 'rating' ? { n: m.delta.toFixed(1) } : m.kind === 'new' ? {} : { days: m.days };
/** Success (a mover) vs. accent (stalled/due/new) for the italic movement line. */
export const chipMoving = (k: Movement['kind']) => k === 'stage' || k === 'tempo' || k === 'rating';

const CAL_KEY = { 'grading-feel': 'progress.calGradingFeel', 'not-speed': 'progress.calNotSpeed', 'hard-days-count': 'progress.calHardDays' } as const;

/** The headline: which pieces are moving, stalled or due — stage, tempo and stars read together. */
export function MovementSection({ pieces, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  if (pieces.length === 0) return null;

  const n = store.stages.length;
  const rows = rankMovement(pieces.map((p) => pieceMovement(p, sessions, store.today, n))).slice(0, MAX_ROWS);

  return (
    <Card>
      <View style={s.head}>
        <Overline>{store.t('progress.moving')}</Overline>
        <Pressable hitSlop={8} onPress={() => router.push('/repertoire')}>
          <Text style={s.allPieces}>{store.t('progress.allPieces')}</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <Pressable key={r.piece.id} style={s.row} onPress={() => router.push(`/piece/${r.piece.id}`)}>
            <View style={s.bar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>
                {r.piece.name}
              </Text>
              <Text style={[s.move, { color: chipMoving(r.move.kind) ? C.success : C.accent }]} numberOfLines={1}>
                {store.t(chipKey(r.move), chipArgs(r.move, store.stages))}
              </Text>
              {r.calibration && <Text style={s.calNote}>{store.t(CAL_KEY[r.calibration])}</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {store.stages.map((_, i) => (
                <View key={i} style={[s.dot, { backgroundColor: i <= r.piece.stage ? C.accent : C.track }]} />
              ))}
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  allPieces: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.hairline },
  bar: { width: 1.5, height: 32, backgroundColor: C.barline },
  name: { fontFamily: F.bodyMed, fontSize: fs(16), lineHeight: fs(22), color: C.ink },
  move: { fontFamily: F.body, fontSize: fs(15), lineHeight: fs(20) },
  calNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
}));
