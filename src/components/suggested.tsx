// "Suggested for today" (#95): a card at the top of the Practice picker that
// turns the Progress tab's diagnoses into a session. One tap runs it through
// the routine runner as a plan the store never sees.
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';

import { PlayIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { Card, EntryRow, Overline } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { setTransientPlan, TRANSIENT_PLAN_ID, useActiveRun } from '@/lib/plan-run-state';
import { dueSpots } from '@/lib/repetition-math';
import { suggestSession, type ReasonKey } from '@/lib/suggest-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

// static keys, so check-i18n can see them
const REASON_KEY: Record<ReasonKey, string> = {
  spotDue: 'suggest.reason.spotDue',
  stalled: 'suggest.reason.stalled',
  review: 'suggest.reason.review',
  plateau: 'suggest.reason.plateau',
  drift: 'suggest.reason.drift',
};

export function SuggestedCard() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const active = useActiveRun();

  // the composer is pure; memoised on exactly what it reads, so the picker's
  // search box does not recompose the session on every keystroke
  const { allPieces, sessions, minutesByDate, dailyGoal, today, weekStart, stages } = store;
  const suggestion = useMemo(
    () =>
      suggestSession({
        pieces: allPieces,
        sessions,
        minutesByDate,
        dailyGoal,
        today,
        monday: weekStart === 'Monday',
        stages: stages.length,
        // the spots due today (#93) feed the composer's first rule
        spots: dueSpots(allPieces, today).map((x) => ({ pieceName: x.piece.name, label: x.spot.label })),
      }),
    [allPieces, sessions, minutesByDate, dailyGoal, today, weekStart, stages.length]
  );

  // hidden: nothing to say, dismissed today, a routine already running, or the day's goal met
  if (!suggestion || store.suggestDismissed === store.today || active || store.todayMin >= store.dailyGoal) return null;

  const total = suggestion.segments.reduce((a, x) => a + x.min, 0);

  const start = () => {
    setTransientPlan({
      id: TRANSIENT_PLAN_ID,
      name: store.t('suggest.title'),
      segments: suggestion.segments.map((x) => ({ focus: { name: x.focusName, kind: x.kind }, min: x.min, ...(x.bpm ? { bpm: x.bpm } : {}) })),
    });
    router.push({ pathname: '/plan/run', params: { id: TRANSIENT_PLAN_ID } });
  };

  return (
    <Card testID="suggest-card" style={s.card}>
      <View style={s.head}>
        <Overline>{store.t('suggest.title')}</Overline>
        <Pressable
          testID="suggest-dismiss"
          hitSlop={10}
          accessibilityLabel={store.t('suggest.dismiss')}
          onPress={() => {
            tap();
            store.updateSettings({ suggestDismissed: store.today });
          }}>
          <Text style={s.close}>×</Text>
        </Pressable>
      </View>
      <View>
        {suggestion.segments.map((x, i) => (
          <View key={x.focusName} testID={`suggest-row-${i}`} style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>
                {x.focusName}
              </Text>
              <Text style={s.reason} numberOfLines={2}>
                {store.t(REASON_KEY[x.reasonKey], { bpm: x.bpm })}
              </Text>
            </View>
            <Text style={s.min}>{store.t('suggest.minutes', { n: x.min })}</Text>
          </View>
        ))}
      </View>
      <EntryRow
        testID="suggest-start"
        keySize={44}
        keyStyle={{ backgroundColor: C.accent }}
        keyContent={<PlayIcon color={C.bg} />}
        title={store.t('suggest.start')}
        subline={store.t('suggest.total', { n: total })}
        right={null}
        onPress={start}
      />
    </Card>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  card: { marginTop: 24, paddingTop: 0, paddingBottom: 8, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { fontSize: fs(22), lineHeight: fs(26), color: C.sub, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.hairline },
  name: { fontFamily: F.bodyMed, fontSize: fs(15.5), lineHeight: fs(20), color: C.ink },
  reason: { marginTop: 1, fontFamily: F.body, fontSize: fs(13), lineHeight: fs(17), color: C.sub },
  min: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.subStrong, fontVariant: ['tabular-nums'] },
}));
