// Month grid used by the past-session log (backwards) and piece deadlines
// (forwards). ponytail: one component, one `direction` prop — a full date
// picker dependency buys nothing this doesn't already do.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { tap } from '@/lib/haptics';
import { dateKey, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export function Calendar({
  value,
  onPick,
  direction,
}: {
  value: string | null;
  onPick: (key: string) => void;
  /** which side of today is selectable; today itself always is */
  direction: 'past' | 'future';
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  // open on the selected month, else the current one
  const [calMonth, setCalMonth] = useState(() => {
    const d = value ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1) : new Date();
    d.setDate(1);
    return d;
  });

  // today comes from the store so the grid follows midnight/month rollovers
  // instead of freezing at first render
  const todayKey = store.today;
  const startDow = store.weekStart === 'Monday' ? 1 : 0;
  const dowLetters = Array.from({ length: 7 }, (_, i) => store.t('logPast.dowLetters')[(i + startDow) % 7]);
  const firstDow = (calMonth.getDay() - startDow + 7) % 7;
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // the current month is the last page forwards for 'past', the first one backwards for 'future'
  const thisMonth = dateKey(calMonth).slice(0, 7) === todayKey.slice(0, 7);
  const backStop = direction === 'future' && thisMonth;
  const fwdStop = direction === 'past' && thisMonth;
  const shiftMonth = (by: number) => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  return (
    <>
      <View style={s.calHeader}>
        <Pressable
          testID="cal-prev"
          style={[s.calNav, backStop && { opacity: 0.25 }]}
          hitSlop={8}
          disabled={backStop}
          onPress={() => shiftMonth(-1)}>
          <Text style={s.calNavText}>‹</Text>
        </Pressable>
        <Text style={s.calMonth}>{calMonth.toLocaleDateString(store.lang, { month: 'long', year: 'numeric' })}</Text>
        <Pressable
          testID="cal-next"
          style={[s.calNav, fwdStop && { opacity: 0.25 }]}
          hitSlop={8}
          disabled={fwdStop}
          onPress={() => shiftMonth(1)}>
          <Text style={s.calNavText}>›</Text>
        </Pressable>
      </View>
      <View style={s.calGrid}>
        {dowLetters.map((l, i) => (
          <Text key={`h${i}`} style={s.calDow}>
            {l}
          </Text>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={s.calCell} />;
          const k = dateKey(new Date(calMonth.getFullYear(), calMonth.getMonth(), day));
          const disabled = direction === 'past' ? k > todayKey : k < todayKey;
          const sel = value === k;
          const isToday = k === todayKey; // outlined, so it still reads when selected (#42)
          return (
            <Pressable
              key={k}
              testID={`cal-day-${k}`}
              style={s.calCell}
              disabled={disabled}
              onPress={() => {
                tap();
                onPick(k);
              }}>
              <View style={[s.calDay, isToday && s.calToday, sel && { backgroundColor: C.accent, borderColor: C.accent }]}>
                <Text
                  style={[
                    s.calDayText,
                    disabled && { color: C.faint },
                    isToday && { fontFamily: F.bodySemi, color: C.accent },
                    sel && { color: C.bg, fontFamily: F.bodySemi },
                  ]}>
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calNav: { width: 32, height: 32, borderRadius: r(16), alignItems: 'center', justifyContent: 'center' },
  calNavText: { fontSize: fs(22), color: C.sub, lineHeight: fs(26) },
  calMonth: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: '14.28%', textAlign: 'center', fontFamily: F.bodySemi, fontSize: fs(11), color: C.tertiary, marginBottom: 6 },
  calCell: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  // a literal 17, not r(): days stay circles whatever the corner setting (#52), and
  // Android draws a 999 radius on a filled, borderless view as a square
  calDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calToday: { borderWidth: 1.5, borderColor: C.accent },
  calDayText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
}));
