import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { MiniTrend } from '@/components/mini-charts';
import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { pieceMovement, rankMovement, type Movement } from '@/lib/movement-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { useS } from './styles';
import type { SectionProps } from './types';

const MAX_ROWS = 5;

const chipKey = (m: Movement) =>
  m.kind === 'stage' ? 'progress.moveStage' : m.kind === 'tempo' ? 'progress.moveTempo' : m.kind === 'rating' ? 'progress.moveRating' : m.kind === 'stalled' ? 'progress.moveStalled' : m.kind === 'due' ? 'progress.moveDue' : 'progress.moveNew';
const chipArgs = (m: Movement, stages: string[]) =>
  m.kind === 'stage' ? { from: stages[m.from] ?? m.from + 1, to: stages[m.to] ?? m.to + 1 } : m.kind === 'tempo' ? { n: m.deltaBpm } : m.kind === 'rating' ? { n: m.delta.toFixed(1) } : m.kind === 'new' ? {} : { days: m.days };
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
  const moving = (k: Movement['kind']) => k === 'stage' || k === 'tempo' || k === 'rating';

  return (
    <Card>
      <Overline style={{ marginBottom: 6 }}>{store.t('progress.moving')}</Overline>
      {rows.map((r) => (
        <Pressable key={r.piece.id} style={s.moveRow} onPress={() => router.push(`/piece/${r.piece.id}`)}>
          <View style={s.moveHead}>
            <Text style={s.skillName} numberOfLines={1}>
              {r.piece.name}
            </Text>
            <View style={[s.moveChip, moving(r.move.kind) ? { backgroundColor: C.successTint } : r.move.kind === 'new' ? undefined : { backgroundColor: C.accentTint }]}>
              <Text style={[s.moveChipText, moving(r.move.kind) ? { color: C.success } : r.move.kind === 'new' ? { color: C.sub } : { color: C.accent }]}>
                {store.t(chipKey(r.move), chipArgs(r.move, store.stages))}
              </Text>
            </View>
          </View>
          <View style={s.moveMeta}>
            <View style={s.stageDots}>
              {store.stages.map((_, i) => (
                <View key={i} style={[s.stageDot, { backgroundColor: i <= r.piece.stage ? C.accent : C.track }]} />
              ))}
            </View>
            {r.ratingFrom !== undefined && r.ratingTo !== undefined && (
              <Text style={s.moveStars}>
                ★ {r.ratingFrom.toFixed(1)} → {r.ratingTo.toFixed(1)}
              </Text>
            )}
            {r.minutes > 0 && <Text style={s.goalNote}>{store.t('progress.timeMin', { min: r.minutes })}</Text>}
          </View>
          {r.spark.length >= 2 && (
            <View style={{ marginTop: 6 }}>
              <MiniTrend values={r.spark} mean={r.spark.map(() => r.target ?? null)} />
            </View>
          )}
          {r.calibration && <Text style={s.calNote}>{store.t(CAL_KEY[r.calibration])}</Text>}
        </Pressable>
      ))}
      <Pressable style={s.customise} hitSlop={8} onPress={() => router.push('/repertoire')}>
        <Text style={s.customiseText}>{store.t('progress.allPieces')}</Text>
      </Pressable>
    </Card>
  );
}
