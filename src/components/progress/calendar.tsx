import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { heatLevel, mix, monthGrid } from '@/lib/heatmap-math';
import { dateKey, dayLabel, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';

import { fmtTime, useS } from './styles';
import type { SectionProps } from './types';

/** A month of practice days, paged, with a per-day session detail. */
export function CalendarSection({ mbd, sessions, onEditSession }: SectionProps) {
  const s = useS();
  const { C, reduceMotion } = useTheme();
  const store = useStore();
  const [selDate, setSelDate] = useState<string | null>(null);
  // month offset 0 = the current month; paging keeps the grid but a selected day belongs to one month only
  const [monthOff, setMonthOff] = useState(0);
  const pageMonth = (d: number) => {
    setMonthOff((o) => o + d);
    setSelDate(null);
  };

  const monday = store.weekStart === 'Monday';
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

  return (
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
        <Text style={s.monthCount}>{store.t('progress.daysPracticed', { practiced, days: elapsedDays })}</Text>
      </View>
      <View style={s.dowRow}>
        {dow.map((d, i) => (
          <Text key={i} style={s.dowText}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((row, wi) => (
        // keyed by month so paging re-mounts the grid and the rows lay themselves out top-down
        <Animated.View key={`${mY}-${mM}-${wi}`} entering={reduceMotion ? undefined : FadeInDown.duration(240).delay(wi * 30)} style={s.weekRow}>
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
        </Animated.View>
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
