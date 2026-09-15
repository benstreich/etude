import React, { useState } from 'react';
import { Pressable, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { chartSeries, heatLevel, mix, monthGrid, type ChartPoint } from '@/lib/heatmap-math';
import { dateKey, dayLabel, useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

const PERIOD_KEY: Record<string, string> = { '7d': 'progress.period7d', '30d': 'progress.period30d', all: 'progress.periodAll' };

/**
 * The same minutes, three ways: a month heatmap with paging and a per-day session
 * detail, or a line or bar chart over the selected period. The choice persists.
 */
export function HeatmapSection({ mbd, monday, sessions, period, onEditSession }: SectionProps) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [selDate, setSelDate] = useState<string | null>(null);
  // month offset 0 = the current month; paging keeps the grid but a selected day belongs to one month only
  const [monthOff, setMonthOff] = useState(0);
  const pageMonth = (d: number) => {
    setMonthOff((o) => o + d);
    setSelDate(null);
  };

  const base = new Date(store.now);
  const mDate = new Date(base.getFullYear(), base.getMonth() - monthOff, 1);
  const mY = mDate.getFullYear();
  const mM = mDate.getMonth();
  const daysInMonth = new Date(mY, mM + 1, 0).getDate();
  const todayDayNum = base.getDate();
  const elapsedDays = monthOff === 0 ? todayDayNum : daysInMonth;
  let practiced = 0;
  for (let d = 1; d <= elapsedDays; d++) if ((mbd[dateKey(new Date(mY, mM, d))] ?? 0) > 0) practiced++;
  const weeks = monthGrid(mY, mM, monday);
  const letters = store.t('common.dayLetters').split('');
  const dow = monday ? [...letters.slice(1), letters[0]] : letters;
  const monthTitle = mDate.toLocaleDateString(store.lang, { month: 'long', year: 'numeric' });
  const heat1 = mix(C.accent, C.bg, 0.65); // 1–24 min
  const heat2 = mix(C.accent, C.bg, 0.35); // 25–39 min

  const view = store.progressChart;
  const series = view === 'calendar' ? [] : chartSeries(mbd, store.today, period);
  const seriesTotal = series.reduce((a, pt) => a + pt.min, 0);
  const setView = (v: 'calendar' | 'line' | 'bars') => {
    store.updateSettings({ progressChart: v });
    setSelDate(null);
  };

  return (
    <Card>
      <View style={s.monthHead}>
        {view === 'calendar' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable hitSlop={10} onPress={() => pageMonth(1)}>
              <Text style={[s.monthChev, { color: C.sub }]}>‹</Text>
            </Pressable>
            <Text style={s.monthTitle}>{monthTitle}</Text>
            <Pressable hitSlop={10} disabled={monthOff === 0} onPress={() => pageMonth(-1)}>
              <Text style={[s.monthChev, { color: monthOff === 0 ? C.faint : C.sub }]}>›</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={s.monthTitle}>{store.t(PERIOD_KEY[period])}</Text>
        )}
        <Text style={s.monthCount}>
          {view === 'calendar'
            ? store.t('progress.daysPracticed', { practiced, days: elapsedDays })
            : fmtTime(seriesTotal, store.t)}
        </Text>
      </View>
      <View style={s.viewRow}>
        {(['calendar', 'line', 'bars'] as const).map((v) => (
          <Pressable
            key={v}
            hitSlop={4}
            style={[s.viewPill, view === v && { backgroundColor: C.accentTint }]}
            onPress={() => setView(v)}>
            <Text style={[s.viewPillText, { color: view === v ? C.accent : C.sub }]}>
              {store.t(`progress.chart${v[0].toUpperCase()}${v.slice(1)}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {view !== 'calendar' && <MinutesChart points={series} kind={view} accent={C.accent} track={C.track} empty={store.t('progress.chartEmpty')} emptyStyle={s.detailEmpty} />}
      {view === 'calendar' && (
      <View style={s.dowRow}>
        {dow.map((d, i) => (
          <Text key={i} style={s.dowText}>
            {d}
          </Text>
        ))}
      </View>
      )}
      {view === 'calendar' && weeks.map((row, wi) => (
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
      {view === 'calendar' && (
      <View style={s.legendRow}>
        <Text style={s.legendText}>{store.t('progress.less')}</Text>
        {[C.track, heat1, heat2, C.accent].map((c, i) => (
          <View key={i} style={[s.legendSwatch, { backgroundColor: c }]} />
        ))}
        <Text style={s.legendText}>{store.t('progress.more')}</Text>
      </View>
      )}
      {selDate && (
        <View style={s.dayDetail}>
          <View style={s.skillRow}>
            <Text style={s.skillName}>{dayLabel(selDate, store.today, store.t, store.lang)}</Text>
            <Text style={s.skillLevel}>{fmtTime(mbd[selDate] ?? 0, store.t)}</Text>
          </View>
          {sessions
            .filter((sess) => sess.date === selDate)
            .map((sess) => (
              <Pressable key={sess.id} style={{ marginTop: 6 }} onPress={() => onEditSession(sess)}>
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
          {!sessions.some((sess) => sess.date === selDate) && <Text style={s.detailEmpty}>{store.t('progress.noSessionDetails')}</Text>}
        </View>
      )}
    </Card>
  );
}

/** Minutes over the selected period. Bars are plain views; the line is one polyline. */
function MinutesChart({
  points,
  kind,
  accent,
  track,
  empty,
  emptyStyle,
}: {
  points: ChartPoint[];
  kind: 'line' | 'bars';
  accent: string;
  track: string;
  empty: string;
  emptyStyle: StyleProp<TextStyle>;
}) {
  const s = useS();
  const [w, setW] = useState(0);
  const H = 108;
  if (points.length === 0) return <Text style={emptyStyle}>{empty}</Text>;
  const max = Math.max(1, ...points.map((p) => p.min));
  const x = (i: number) => (points.length === 1 ? w / 2 : 2 + (i * (w - 4)) / (points.length - 1));
  const y = (min: number) => H - 6 - (min / max) * (H - 18);

  return (
    <View style={s.chartBox} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {kind === 'bars' ? (
        <View style={s.barRow}>
          {points.map((p) => (
            <View key={p.label} style={[s.bar, { height: `${Math.max(2, (p.min / max) * 100)}%`, backgroundColor: p.min > 0 ? accent : track }]} />
          ))}
        </View>
      ) : (
        w > 0 && (
          <Svg width={w} height={H}>
            <Polyline points={points.map((p, i) => `${x(i)},${y(p.min)}`).join(' ')} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
          </Svg>
        )
      )}
    </View>
  );
}
