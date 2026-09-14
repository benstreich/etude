import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';

import { EditSessionSheet } from '@/components/edit-session';
import { ShareIcon } from '@/components/icons';
import { RecapModal } from '@/components/recap-card';
import { Text } from '@/components/text';
import { Bar, Card, InstrumentFilter, Overline, ScreenTitle, useInstrumentFilter } from '@/components/ui';
import { deadlineStatus, goalProgress, type GoalPeriod } from '@/lib/goal-math';
import { heatLevel, mix, monthGrid } from '@/lib/heatmap-math';
import { byLength, byTimeOfDay, concentration, consistency, MIN_INSIGHT_DAYS, MIN_RATED, projection, qualityDrivers, rated, ratingByFocus, ratingByWeek, staleness, streakSurvival, TIME_OF_DAY, type Bucket } from '@/lib/stats-math';
import { dateKey, dayLabel, FocusPeriod, Session, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const fmtTime = (min: number, t: (key: string, opts?: Record<string, unknown>) => string) =>
  min >= 60 ? t('progress.timeHM', { h: Math.floor(min / 60), m: min % 60 }) : t('progress.timeMin', { min });

const PERIODS: { key: FocusPeriod; labelKey: string; days: number | null }[] = [
  { key: '7d', labelKey: 'progress.period7d', days: 7 },
  { key: '30d', labelKey: 'progress.period30d', days: 30 },
  { key: 'all', labelKey: 'progress.periodAll', days: null },
];

export default function Progress() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selDate, setSelDate] = useState<string | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  // #58: one instrument's slice of the log; the heatmap and week stats re-derive their
  // daily minutes from the filtered sessions instead of the global rollup
  const inst = useInstrumentFilter();
  const sessions = inst ? store.sessions.filter((x) => x.instrument === inst) : store.sessions;
  const mbd = inst
    ? sessions.reduce<Record<string, number>>((a, x) => ((a[x.date] = (a[x.date] ?? 0) + x.min), a), {})
    : store.minutesByDate;
  const empty = store.totalMin === 0 && sessions.length === 0;

  // calendar week honoring the "Week starts on" setting; chart below stays rolling last-7-days.
  // anchored on store.now so the numbers follow the calendar instead of freezing at mount
  const start = store.weekStart === 'Monday' ? 1 : 0;
  const elapsed = ((new Date(store.now).getDay() - start + 7) % 7) + 1;
  let weekTotal = 0;
  let weekPracticed = 0; // avg divides by practiced days only — zero days would dilute it (#25)
  for (let i = 0; i < elapsed; i++) {
    const d = new Date(store.now);
    d.setDate(d.getDate() - i);
    const min = mbd[dateKey(d)] ?? 0;
    weekTotal += min;
    if (min > 0) weekPracticed++;
  }
  // month heatmap: offset 0 = the current month
  const [monthOff, setMonthOff] = useState(0);
  // paging months keeps the grid but a selected day belongs to one month only
  const pageMonth = (d: number) => {
    setMonthOff((o) => o + d);
    setSelDate(null);
  };
  const [editSess, setEditSess] = useState<Session | null>(null);
  const base = new Date(store.now);
  const mDate = new Date(base.getFullYear(), base.getMonth() - monthOff, 1);
  const mY = mDate.getFullYear();
  const mM = mDate.getMonth();
  const daysInMonth = new Date(mY, mM + 1, 0).getDate();
  const todayDayNum = base.getDate();
  const elapsedDays = monthOff === 0 ? todayDayNum : daysInMonth;
  let practiced = 0;
  for (let d = 1; d <= elapsedDays; d++) if ((mbd[dateKey(new Date(mY, mM, d))] ?? 0) > 0) practiced++;
  const weeks = monthGrid(mY, mM, start === 1);
  const letters = store.t('common.dayLetters').split('');
  const dow = start === 1 ? [...letters.slice(1), letters[0]] : letters;
  const monthTitle = mDate.toLocaleDateString(store.lang, { month: 'long', year: 'numeric' });
  const heat1 = mix(C.accent, C.bg, 0.65); // 1–24 min
  const heat2 = mix(C.accent, C.bg, 0.35); // 25–39 min

  // minutes per piece/technique within the selected period
  const period = PERIODS.find((p) => p.key === store.focusPeriod) ?? PERIODS[1];
  // setDate, not fixed 24h ms, so the cutoff day survives DST changes
  const cutoffDate = new Date(store.now);
  cutoffDate.setDate(cutoffDate.getDate() - ((period.days ?? 1) - 1));
  const cutoff = period.days ? dateKey(cutoffDate) : '';
  // the period picker filters every session-based card below; the heatmap and week stats stay calendar-based
  const inPeriod = sessions.filter((sess) => sess.date >= cutoff);
  const focusRows = ratingByFocus(inPeriod);
  const focusMax = focusRows[0]?.min ?? 1;

  // rating statistics (#54) — hidden below MIN_RATED rated sessions in the period rather than showing noise
  const enoughRated = rated(inPeriod).length >= MIN_RATED;
  // ponytail: the trend always spans 12 weeks over all sessions — a 7-day window has no trend to draw
  const weekPoints = ratingByWeek(sessions, store.today, start === 1);
  const timeOfDay = byTimeOfDay(inPeriod);
  const lengths = byLength(inPeriod);
  const cons = consistency(mbd, store.today, start === 1);
  const stars = (v: number | null) => (v === null ? '—' : `★ ${v.toFixed(1)}`);

  // #61 insights — one sentence each; every helper returns null when the data is too thin
  const dayNames = store.t('common.dayNames').split(',');
  const drivers = enoughRated ? qualityDrivers(inPeriod) : [];
  const driverLabel = (d: (typeof drivers)[number]) =>
    d.dim === 'timeOfDay' ? store.t(`progress.${d.best}`).toLowerCase() : d.dim === 'length' ? store.t('progress.lengthMin', { range: d.best }) : store.t(`progress.${d.best}`);
  const conc = concentration(inPeriod);
  const survival = streakSurvival(mbd, store.today);
  const proj = projection(mbd, inst ? sessions.reduce((a, x) => a + x.min, 0) : store.totalMin, store.today);
  const due = store.pieces
    .filter((p) => !p.archived && p.stage >= store.stages.length - 1 && (!inst || !p.instrument || p.instrument === inst))
    .map((p) => ({ p, st: staleness(sessions.filter((x) => x.title === p.name).map((x) => x.date), store.today) }))
    .filter((x) => x.st?.due)
    .sort((a, b) => b.st!.daysSince - a.st!.daysSince);
  // a first week of data produces confident nonsense (#77) — say nothing until there is history
  const enoughHistory = Object.keys(mbd).filter((k) => mbd[k] > 0 && k <= store.today).length >= MIN_INSIGHT_DAYS;
  const insights: string[] = !enoughHistory ? [] : [
    ...(drivers.length ? [store.t('progress.driversSentence', { list: drivers.map(driverLabel).join(' · ') })] : []),
    ...(conc && conc.top < conc.total ? [store.t('progress.concentrationSentence', { pct: conc.pct, top: conc.top, total: conc.total })] : []),
    ...(survival ? [store.t('progress.streakSentence', { day: survival.typicalLength + 1, weekday: dayNames[survival.breakWeekday] })] : []),
    ...(proj ? [store.t('progress.paceSentence', { hours: proj.hoursByYearEnd })] : []),
    ...(proj?.milestoneDate ? [store.t('progress.milestoneSentence', { hours: proj.milestoneH, date: new Date(proj.milestoneDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' }) })] : []),
    ...due.slice(0, 3).map((x) => store.t('progress.dueSentence', { piece: x.p.name, days: x.st!.daysSince })),
  ];

  // period goals (#56) — each row is done/target plus whether today's pace is met
  const goalRows = ([
    ['week', store.weeklyGoal],
    ['month', store.monthlyGoal],
    ['year', store.yearlyGoal],
  ] as const).map(([period, goal]) => ({
    period: period as GoalPeriod,
    ...goalProgress({
      period,
      goal,
      todayKey: store.today,
      minutesByDate: store.minutesByDate,
      dailyGoal: store.dailyGoal,
      breakDays: store.breakDays,
      weekStart: store.weekStart,
    }),
  }));

  // pieces with a "mastered by" date, soonest first; finished ones drop off
  const deadlines = store.pieces
    .filter((p) => !p.archived && p.targetDate)
    .map((p) => ({ p, d: deadlineStatus({ targetDate: p.targetDate!, todayKey: store.today, addedAt: p.addedAt, stage: p.stage, stages: store.stages.length }) }))
    .filter((x) => !x.d.done)
    .sort((a, b) => a.d.days - b.d.days);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ScreenTitle>{store.t('tabs.progress')}</ScreenTitle>
        {!empty && (
          <Pressable style={s.shareBtn} hitSlop={8} onPress={() => setRecapOpen(true)}>
            <ShareIcon />
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>{store.t('progress.thisWeek')}</Overline>
          <Text style={s.statNum}>
            {weekTotal}
            <Text style={s.statUnit}> {store.t('progress.minUnit')}</Text>
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>{store.t('progress.avgPerDay')}</Overline>
          <Text style={s.statNum}>
            {empty ? '—' : Math.round(weekTotal / Math.max(1, weekPracticed))}
            {!empty && <Text style={s.statUnit}> {store.t('progress.minUnit')}</Text>}
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>{store.t('progress.allTime')}</Overline>
          <Text style={s.statNum}>
            {Math.floor(store.totalMin / 60)}
            <Text style={s.statUnit}> {store.t('progress.hrUnit')}</Text>
          </Text>
        </Card>
      </View>

      {!empty && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <InstrumentFilter />
        <View style={s.segTrack}>
          {PERIODS.map((p) => {
            const sel = p.key === period.key;
            return (
              <Pressable key={p.key} style={[s.segBtn, sel && s.segBtnSel]} onPress={() => store.updateSettings({ focusPeriod: p.key })}>
                <Text style={[s.segText, sel && { color: C.ink }]}>{store.t(p.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        </View>
      )}

      {!empty && goalRows.some((g) => g.target > 0) && (
        <Card style={{ gap: 14 }}>
          <Overline>{store.t('progress.goals')}</Overline>
          {goalRows
            .filter((g) => g.target > 0)
            .map((g) => (
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
                  {g.left === 0
                    ? store.t('progress.goalMet')
                    : g.onTrack
                      ? store.t('progress.goalAhead', { min: g.left })
                      : store.t('progress.goalBehind', { min: g.pace - g.done })}
                </Text>
              </View>
            ))}
        </Card>
      )}

      {deadlines.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Overline>{store.t('progress.deadlines')}</Overline>
          {deadlines.map(({ p, d }) => (
            <Pressable key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push(`/piece/${p.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.goalLabel} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={s.goalNote}>
                  {new Date(p.targetDate + 'T12:00:00').toLocaleDateString(store.lang, { month: 'long', day: 'numeric' })} ·{' '}
                  {d.overdue ? store.t('progress.overdueBy', { count: -d.days }) : store.t('progress.daysLeft', { count: d.days })}
                </Text>
              </View>
              <Text style={[s.goalBadge, { color: d.overdue || !d.onTrack ? C.accent : C.success }]}>
                {d.onTrack ? store.t('piece.onTrack') : store.t('piece.behind')}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}

      {empty ? (
        <Card>
          <Overline style={{ marginBottom: 16 }}>{store.t('progress.last7Days')}</Overline>
          <View style={s.chart}>
            {[22, 48, 30, 64, 40, 78, 55].map((h, i) => (
              <View key={i} style={s.col}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View
                    style={{
                      height: `${h}%`,
                      backgroundColor: i === 6 ? C.accentTint : C.track,
                      borderTopLeftRadius: 5,
                      borderTopRightRadius: 5,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'center', gap: 6, marginTop: 18 }}>
            <Text style={s.emptyTitle}>{store.t('progress.emptyTitle')}</Text>
            <Text style={s.emptyText}>{store.t('progress.emptyText')}</Text>
            <Pressable style={s.tintBtn} onPress={() => router.push('/practice')}>
              <Text style={s.tintBtnText}>{store.t('progress.startPracticing')}</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
      <Card>
        <View style={s.monthHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable hitSlop={10} onPress={() => pageMonth(1)}>
              <Text style={[s.monthChev, { color: C.sub }]}>‹</Text>
            </Pressable>
            <Text style={s.monthTitle}>{monthTitle}</Text>
            <Pressable hitSlop={10} disabled={monthOff === 0} onPress={() => pageMonth(-1)}>
              <Text style={[s.monthChev, { color: monthOff === 0 ? C.faint : C.sub }]}>›</Text>
            </Pressable>
          </View>
          <Text style={s.monthCount}>
            {store.t('progress.daysPracticed', { practiced, days: elapsedDays })}
          </Text>
        </View>
        <View style={s.dowRow}>
          {dow.map((d, i) => (
            <Text key={i} style={s.dowText}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((row, wi) => (
          <View key={wi} style={s.weekRow}>
            {row.map((day, di) => {
              if (day === null) return <View key={di} style={s.cell} />;
              const key = dateKey(new Date(mY, mM, day));
              const level = heatLevel(mbd[key] ?? 0);
              const future = monthOff === 0 && day > elapsedDays;
              const isToday = monthOff === 0 && day === todayDayNum;
              const bg = future ? 'transparent' : [C.track, heat1, heat2, C.accent][level];
              const num = future ? C.faint : [C.tertiary, C.accentDark, '#FFFFFF', '#FFFFFF'][level];
              return (
                <Pressable
                  key={di}
                  disabled={future}
                  style={[
                    s.cell,
                    { backgroundColor: bg },
                    future && { borderWidth: 1, borderStyle: 'dashed', borderColor: C.cardBorder },
                    isToday && { borderWidth: 2, borderStyle: 'solid', borderColor: C.ink },
                    selDate === key && !isToday && { borderWidth: 2, borderStyle: 'solid', borderColor: C.accentDark },
                  ]}
                  onPress={() => setSelDate(selDate === key ? null : key)}>
                  <Text style={[s.cellNum, { color: num }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={s.legendRow}>
          <Text style={s.legendText}>{store.t('progress.less')}</Text>
          {[C.track, heat1, heat2, C.accent].map((c, i) => (
            <View key={i} style={[s.legendSwatch, { backgroundColor: c }]} />
          ))}
          <Text style={s.legendText}>{store.t('progress.more')}</Text>
        </View>
        {selDate && (
          <View style={s.dayDetail}>
            <View style={s.skillRow}>
              <Text style={s.skillName}>{dayLabel(selDate, store.today, store.t, store.lang)}</Text>
              <Text style={s.skillLevel}>{fmtTime(mbd[selDate] ?? 0, store.t)}</Text>
            </View>
            {sessions
              .filter((sess) => sess.date === selDate)
              .map((sess) => (
                <Pressable key={sess.id} style={{ marginTop: 6 }} onPress={() => setEditSess(sess)}>
                  <View style={s.detailRow}>
                    <Text style={s.detailTitle}>{sess.title}</Text>
                    <Text style={s.skillLevel}>
                      {!!sess.rating && <Text style={{ color: C.accent }}>★ {sess.rating} · </Text>}
                      {fmtTime(sess.min, store.t)}
                    </Text>
                  </View>
                  {!!sess.note && <Text style={s.detailNote}>{sess.note}</Text>}
                </Pressable>
              ))}
            {!sessions.some((sess) => sess.date === selDate) && (
              <Text style={s.detailEmpty}>{store.t('progress.noSessionDetails')}</Text>
            )}
          </View>
        )}
      </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <Overline style={{ marginBottom: 4 }}>{store.t('progress.timeByFocus')}</Overline>
          {focusRows.length === 0 && <Text style={s.detailEmpty}>{store.t('progress.nothingInPeriod')}</Text>}
          {focusRows.map((f) => (
            <View key={f.title} style={{ marginTop: 16 }}>
              <View style={s.skillRow}>
                <Text style={s.skillName}>{f.title}</Text>
                <Text style={s.skillLevel}>
                  {f.avgRating !== null && <Text style={{ color: C.accent }}>{stars(f.avgRating)} · </Text>}
                  {fmtTime(f.min, store.t)}
                </Text>
              </View>
              <Bar pct={(f.min / focusMax) * 100} />
            </View>
          ))}
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <View style={s.focusHead}>
            <Overline>{store.t('progress.consistency')}</Overline>
            <Text style={s.skillLevel}>{store.t('progress.avgDaysPerWeek', { n: cons.average })}</Text>
          </View>
          <View style={[s.chart, { height: 56 }]}>
            {cons.perWeek.map((d, i) => (
              <View key={i} style={s.col}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View style={{ height: `${Math.max(4, (d / 7) * 100)}%`, backgroundColor: i === cons.perWeek.length - 1 ? C.accent : C.track, borderRadius: 3 }} />
                </View>
              </View>
            ))}
          </View>
          <Text style={[s.detailEmpty, { marginTop: 10 }]}>{store.t('progress.daysThisWeek', { n: cons.current })}</Text>
        </Card>
      )}

      {enoughRated && (
        <>
          <Card>
            <View style={s.focusHead}>
              <Overline>{store.t('progress.ratingOverTime')}</Overline>
              <Text style={s.skillLevel}>{store.t('progress.last12Weeks')}</Text>
            </View>
            {/* minutes as bars behind, weekly average rating as a line — hand-drawn like the tempo ladder */}
            <Svg width="100%" height={96} viewBox="0 0 240 96" preserveAspectRatio="none">
              {weekPoints.map((w, i) => {
                const max = Math.max(1, ...weekPoints.map((x) => x.min));
                const h = (w.min / max) * 80;
                return <Rect key={w.week} x={i * 20 + 3} y={88 - h} width={14} height={h} rx={2} fill={C.track} />;
              })}
              <Polyline
                points={weekPoints
                  .map((w, i) => (w.avgRating === null ? null : `${i * 20 + 10},${88 - ((w.avgRating - 1) / 4) * 80}`))
                  .filter(Boolean)
                  .join(' ')}
                fill="none"
                stroke={C.accent}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {weekPoints.map((w, i) =>
                w.avgRating === null ? null : <Circle key={w.week} cx={i * 20 + 10} cy={88 - ((w.avgRating - 1) / 4) * 80} r={3} fill={C.accent} />
              )}
            </Svg>
          </Card>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1 }}>
              <Overline style={{ marginBottom: 12 }}>{store.t('progress.bestTimeOfDay')}</Overline>
              {timeOfDay.map((b, i) => (
                <BucketRow key={b.label} label={store.t(`progress.${TIME_OF_DAY[i]}`)} b={b} value={fmtTime(b.min, store.t)} stars={stars} s={s} />
              ))}
            </Card>
            <Card style={{ flex: 1 }}>
              <Overline style={{ marginBottom: 12 }}>{store.t('progress.sessionLength')}</Overline>
              {lengths.map((b) => (
                <BucketRow key={b.label} label={b.label} b={b} value={String(b.n)} stars={stars} s={s} />
              ))}
            </Card>
          </View>
        </>
      )}

      {insights.length > 0 && (
        <Card>
          <Overline style={{ marginBottom: 6 }}>{store.t('progress.insights')}</Overline>
          {insights.map((line, i) => (
            <View key={i} style={s.bucketRow}>
              <Text style={s.insight}>{line}</Text>
            </View>
          ))}
        </Card>
      )}

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
      <RecapModal visible={recapOpen} onClose={() => setRecapOpen(false)} />
    </ScrollView>
  );
}

/** One line of a bucket card: label, count/minutes, average rating. */
function BucketRow({ label, b, value, stars, s }: { label: string; b: Bucket; value: string; stars: (v: number | null) => string; s: ReturnType<typeof useS> }) {
  const C = useC();
  return (
    <View style={s.bucketRow}>
      <Text style={[s.bucketLabel, b.n === 0 && { color: C.tertiary }]}>{label}</Text>
      <Text style={s.skillLevel}>{b.n === 0 ? '—' : value}</Text>
      <Text style={[s.bucketStars, { color: b.avgRating === null ? C.tertiary : C.accent }]}>{stars(b.avgRating)}</Text>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  bucketRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.hairline },
  bucketLabel: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(13), color: C.ink },
  insight: { flex: 1, fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.ink },
  bucketStars: { fontFamily: F.bodySemi, fontSize: fs(12), minWidth: 42, textAlign: 'right' },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: fs(30), color: C.ink },
  goalLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  goalValue: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  goalTarget: { fontFamily: F.body, fontSize: fs(13), color: C.sub },
  goalNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  goalBadge: { fontFamily: F.bodySemi, fontSize: fs(12.5) },
  statUnit: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  chart: { height: 110, flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  monthHead: { alignItems: 'center', gap: 2, marginBottom: 14 },
  monthTitle: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink, marginHorizontal: 6 },
  monthChev: { fontSize: fs(20), lineHeight: fs(22), paddingHorizontal: 4 },
  monthCount: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  dowRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  dowText: { flex: 1, textAlign: 'center', fontFamily: F.bodySemi, fontSize: fs(10), color: C.tertiary },
  weekRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: r(8), alignItems: 'center', justifyContent: 'center' },
  cellNum: { fontFamily: F.bodySemi, fontSize: fs(11.5) },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: r(3.5) },
  legendText: { fontFamily: F.body, fontSize: fs(10.5), color: C.tertiary, marginHorizontal: 2 },
  focusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  segTrack: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.track, borderRadius: r(999), padding: 2.5 },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayDetail: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.hairline },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailTitle: { fontFamily: F.body, fontSize: fs(14), color: C.sub },
  detailNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.subStrong, fontStyle: 'italic', marginTop: 2 },
  detailEmpty: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong, marginTop: 4 },
  skillName: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  skillLevel: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  emptyTitle: { fontFamily: F.head, fontSize: fs(16), color: C.ink },
  emptyText: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(20), color: C.sub, maxWidth: 250, textAlign: 'center' },
  tintBtn: { height: 42, paddingHorizontal: 18, borderRadius: r(12), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  tintBtnText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  shareBtn: { width: 38, height: 38, borderRadius: r(19), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
}));
