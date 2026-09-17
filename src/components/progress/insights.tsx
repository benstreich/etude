import React from 'react';
import { View } from 'react-native';

import { MiniBars, MiniTrend } from '@/components/mini-charts';
import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { concentration, goalCalibration, interleaving, MIN_INSIGHT_DAYS, MIN_RATED, projection, qualityDrivers, rated, rollingMean, staleness, streakSurvival, TIME_OF_DAY, weeklyTotals, byTimeOfDay } from '@/lib/stats-math';
import { useStore } from '@/lib/store';

import { PeriodHead, usePeriod } from './period';
import { useS } from './styles';
import type { SectionProps } from './types';

/** #61 insights — one sentence each, with a small chart where one helps (#71). Every helper returns null when the data is too thin. */
export function InsightsSection({ sessions, pieces, mbd, monday, inst }: SectionProps) {
  const s = useS();
  const store = useStore();
  const { inPeriod, picker } = usePeriod(sessions);

  // a first week of data produces confident nonsense (#77) — say nothing until there is history
  const enoughHistory = Object.keys(mbd).filter((k) => mbd[k] > 0 && k <= store.today).length >= MIN_INSIGHT_DAYS;
  if (!enoughHistory) return null;

  const dayNames = store.t('common.dayNames').split(',');
  const drivers = rated(inPeriod).length >= MIN_RATED ? qualityDrivers(inPeriod) : [];
  const driverLabel = (d: (typeof drivers)[number]) =>
    d.dim === 'timeOfDay' ? store.t(`progress.${d.best}`).toLowerCase() : d.dim === 'length' ? store.t('progress.lengthMin', { range: d.best }) : store.t(`progress.${d.best}`);
  const timeOfDay = byTimeOfDay(inPeriod);
  const conc = concentration(inPeriod);
  const survival = streakSurvival(mbd, store.today);
  const proj = projection(mbd, inst ? sessions.reduce((a, x) => a + x.min, 0) : store.totalMin, store.today);
  const due = pieces
    .filter((p) => p.stage >= store.stages.length - 1)
    .map((p) => ({ p, st: staleness(sessions.filter((x) => x.title === p.name).map((x) => x.date), store.today) }))
    .filter((x) => x.st?.due)
    .sort((a, b) => b.st!.daysSince - a.st!.daysSince);
  const cal = goalCalibration({ minutesByDate: mbd, today: store.today, dailyGoal: store.dailyGoal, weeklyGoal: store.weeklyGoal, weekStart: store.weekStart });
  const inter = interleaving(sessions, store.today, monday);
  const weekMins = weeklyTotals(mbd, store.today, monday);
  const streakHist = survival
    ? [1, 2, 3, [4, 6], [7, Infinity]].map((b) => survival.lengths.filter((l) => (Array.isArray(b) ? l >= b[0] && l <= b[1] : l === b)).length)
    : [];

  const insights: { text: string; chart?: React.ReactNode }[] = [
    ...(cal.daily ? [{ text: store.t('progress.goalDailySentence', cal.daily) }] : []),
    ...(cal.weekly ? [{ text: store.t('progress.goalWeeklySentence', cal.weekly) }] : []),
    ...(drivers.length
      ? [{
          text: store.t('progress.driversSentence', { list: drivers.map(driverLabel).join(' · ') }),
          chart: drivers.some((d) => d.dim === 'timeOfDay') ? (
            <MiniBars values={timeOfDay.map((b) => b.min)} labels={TIME_OF_DAY.map((k) => store.t(`progress.${k}`))} highlight={TIME_OF_DAY.indexOf(drivers.find((d) => d.dim === 'timeOfDay')!.best)} />
          ) : undefined,
        }]
      : []),
    ...(inter ? [{ text: store.t('progress.interleavingSentence', inter) }] : []),
    ...(conc && conc.top < conc.total ? [{ text: store.t('progress.concentrationSentence', { pct: conc.pct, top: conc.top, total: conc.total }) }] : []),
    ...(survival
      ? [{
          text: store.t('progress.streakSentence', { day: survival.typicalLength + 1, weekday: dayNames[survival.breakWeekday] }),
          chart: <MiniBars values={streakHist} labels={['1', '2', '3', '4–6', '7+']} />,
        }]
      : []),
    ...(proj ? [{ text: store.t('progress.paceSentence', { hours: proj.hoursByYearEnd }), chart: <MiniTrend values={weekMins} mean={rollingMean(weekMins, 4)} /> }] : []),
    ...(proj?.milestoneDate
      ? [{ text: store.t('progress.milestoneSentence', { hours: proj.milestoneH, date: new Date(proj.milestoneDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' }) }) }]
      : []),
    ...due.slice(0, 3).map((x) => ({ text: store.t('progress.dueSentence', { piece: x.p.name, days: x.st!.daysSince }) })),
  ];
  if (insights.length === 0) return null;

  return (
    <Card>
      <PeriodHead title={store.t('progress.insights')} picker={picker} style={{ marginBottom: 6 }} />
      {insights.map((item, i) => (
        <View key={i} style={s.insightRow}>
          <Text style={s.insight}>{item.text}</Text>
          {item.chart}
        </View>
      ))}
    </Card>
  );
}
