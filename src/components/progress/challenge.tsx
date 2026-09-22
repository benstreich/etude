import React from 'react';
import { View } from 'react-native';

import { MeasureBar } from '@/components/motifs';
import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { monthlyChallenge } from '@/lib/challenge-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/**
 * The monthly challenge (#105): one sentence, a bar, and a quiet footer. Derived
 * on every render from the whole history (never the instrument slice — the
 * challenge is about the month, not a view of it). Null below the data floor;
 * the layout sheet explains why (progress-availability). No countdown urgency
 * and no failure state: the copy is the target, the figures, and how it ended.
 */
export function ChallengeSection(_: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const ch = monthlyChallenge({
    todayKey: store.today,
    minutesByDate: store.minutesByDate,
    dailyGoal: store.dailyGoal,
    breakDays: store.breakDays,
    weekStart: store.weekStart,
  });
  if (!ch) return null;

  const month = new Date(store.now).toLocaleDateString(store.lang, { month: 'long' });
  const sentence =
    ch.kind === 'days'
      ? store.t('progress.challengeDays', { target: ch.target, month })
      : ch.kind === 'goalDays'
        ? store.t('progress.challengeGoalDays', { target: ch.target, month })
        : store.t('progress.challengeMinutes', { time: fmtTime(ch.target, store.t), month });
  const figure = ch.kind === 'minutes' ? `${fmtTime(ch.done, store.t)} / ${fmtTime(ch.target, store.t)}` : `${ch.done} / ${ch.target}`;

  return (
    <Card testID="progress-challenge" style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Overline>{store.t('progress.section.challenge')}</Overline>
        <Text style={s.goalValue}>{figure}</Text>
      </View>
      <Text style={s.goalLabel}>{sentence}</Text>
      {/* the same measure the goals card draws; MeasureBar honours reduceMotion itself */}
      <MeasureBar segments={[1, 1, 1, 1]} done={ch.target > 0 ? ch.done / ch.target : 0} color={ch.met ? C.success : C.accent} />
      <Text style={[s.goalNote, ch.met && { color: C.success }]}>
        {ch.met ? store.t('progress.challengeMet') : store.t('progress.challengeDaysLeft', { count: ch.daysLeft })}
      </Text>
    </Card>
  );
}
