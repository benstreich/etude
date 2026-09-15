import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { Bar, Card, Overline } from '@/components/ui';
import { deadlineStatus, goalProgress, type GoalPeriod } from '@/lib/goal-math';
import { pieceRatings, ratingForecast, rollingAvg } from '@/lib/rating-math';
import { tempoForecast } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/** Period goals (#56) and piece deadlines in one card. Null when neither has anything to show. */
export function GoalsSection({ pieces, sessions }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();

  const goalRows = ([
    ['week', store.weeklyGoal],
    ['month', store.monthlyGoal],
    ['year', store.yearlyGoal],
  ] as const)
    .map(([period, goal]) => ({
      period: period as GoalPeriod,
      ...goalProgress({ period, goal, todayKey: store.today, minutesByDate: store.minutesByDate, dailyGoal: store.dailyGoal, breakDays: store.breakDays, weekStart: store.weekStart }),
    }))
    .filter((g) => g.target > 0);

  // soonest first; finished ones drop off. Every signal with a target has to be on pace.
  const deadlines = pieces
    .filter((p) => p.targetDate)
    .map((p) => {
      const ratings = pieceRatings(p, sessions);
      const own = sessions.filter((x) => x.title === p.name);
      const tf = p.targetBpm ? tempoForecast(p.tempoLog ?? [], p.targetBpm, store.today, own) : null;
      return {
        p,
        d: deadlineStatus({
          targetDate: p.targetDate!,
          todayKey: store.today,
          addedAt: p.addedAt,
          stage: p.stage,
          stages: store.stages.length,
          targetBpm: p.targetBpm,
          tempoReachDate: p.targetBpm ? (tf?.reachDate ?? null) : undefined,
          targetRating: p.targetRating,
          ratingAvg: rollingAvg(ratings),
          ratingReachDate: p.targetRating ? (ratingForecast(ratings, p.targetRating, store.today)?.reachDate ?? null) : undefined,
        }),
      };
    })
    .filter((x) => !x.d.done)
    .sort((a, b) => a.d.days - b.d.days);

  if (goalRows.length === 0 && deadlines.length === 0) return null;

  return (
    <Card style={{ gap: 14 }}>
      {goalRows.length > 0 && (
        <>
          <Overline>{store.t('progress.goals')}</Overline>
          {goalRows.map((g) => (
            <View key={g.period} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={s.goalLabel}>{store.t(`progress.goal_${g.period}`)}</Text>
                <Text style={s.goalValue}>
                  {fmtTime(g.done, store.t)}
                  <Text style={s.goalTarget}> / {fmtTime(g.target, store.t)}</Text>
                </Text>
              </View>
              <Bar pct={g.pct} color={g.onTrack ? C.success : C.accent} height={6} />
              <Text style={[s.goalNote, !g.onTrack && { color: C.accent }]}>
                {g.left === 0 ? store.t('progress.goalMet') : g.onTrack ? store.t('progress.goalAhead', { min: g.left }) : store.t('progress.goalBehind', { min: g.pace - g.done })}
              </Text>
            </View>
          ))}
        </>
      )}
      {deadlines.length > 0 && (
        <>
          <Overline style={goalRows.length > 0 ? { marginTop: 6 } : undefined}>{store.t('progress.deadlines')}</Overline>
          {deadlines.map(({ p, d }) => (
            <Pressable key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push(`/piece/${p.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.goalLabel} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={s.goalNote}>
                  {new Date(p.targetDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' })} ·{' '}
                  {d.overdue ? store.t('progress.overdueBy', { count: -d.days }) : store.t('progress.daysLeft', { count: d.days })}
                  {d.lagging.length > 0 && ` · ${store.t('piece.lagging', { list: d.lagging.map((k) => store.t(`piece.${k}Word`)).join(', ') })}`}
                </Text>
              </View>
              <Text style={[s.goalBadge, { color: d.overdue || !d.onTrack ? C.accent : C.success }]}>{d.onTrack ? store.t('piece.onTrack') : store.t('piece.behind')}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Card>
  );
}
