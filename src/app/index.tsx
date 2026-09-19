import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated, { FadeIn } from 'react-native-reanimated';
import { EditSessionSheet } from '@/components/edit-session';
import { ProgressBody } from '@/components/progress';
import { ExpandIcon, FlameIcon, GearIcon, LogoMark, SlidersIcon } from '@/components/icons';
import { InstrumentAsk } from '@/components/instrument-ask';
import { LogPastModal } from '@/components/log-past';
import { ProgressLayoutSheet } from '@/components/progress-layout-sheet';
import { StaffLegend } from '@/components/staff-legend';
import { FermataMark, MelodyStaff, RollingNumber } from '@/components/motifs';
import { success, tap } from '@/lib/haptics';
import { barsFor } from '@/lib/melody';
import { useMelodyPlayer } from '@/lib/melody-play';
import { Text } from '@/components/text';
import { fmtTime } from '@/components/progress/styles';
import { useInstrumentFilter } from '@/components/ui';
import { instrumentChoices } from '@/lib/instrument-math';
import { dateKey, dayLabel, useStore, type Session } from '@/lib/store';
import { F, themed, useTheme, type T } from '@/lib/theme';

// taking `now` from the store keeps these reactive — a bare new Date() here gets
// cached once by the react-compiler and shows yesterday after a midnight rollover
const greeting = (now: number, t: (k: string) => string) => {
  const h = new Date(now).getHours();
  return h < 12 ? t('home.goodMorning') : h < 18 ? t('home.goodAfternoon') : t('home.goodEvening');
};

export default function Home() {
  const s = useS();
  const { C, reduceMotion, fs } = useTheme();
  const store = useStore();
  const inst = useInstrumentFilter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focusOpen, setFocusOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const melody = useMelodyPlayer();
  const [resumeAt, setResumeAt] = useState<string | null>(null); // the bar a pause stopped on
  const [editSess, setEditSess] = useState<Session | null>(null);
  // which day the log below the staff is reading; a tap on a note moves it
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [pendingLog, setPendingLog] = useState<number | null>(null); // minutes waiting on "which instrument?"
  const day = pickedDay ?? store.today;

  const focusOptions: { name: string; kind: 'Piece' | 'Technique' }[] = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ name: p.name, kind: 'Piece' as const })),
    ...store.techniques.map((t) => ({ name: t, kind: 'Technique' as const })),
  ];

  // logs to whichever day the staff below has selected, so a missed day can be
  // filled in without leaving Home; today is the default
  // #58 follow-up: a quick log against a piece played on two instruments has the same
  // question to answer as a timed session — ask, then log with the answer.
  const quickLog = (min: number, on?: string) => {
    if (!min) return;
    const f = store.quickLogFocus;
    if (!on && instrumentChoices(store.allPieces.find((p) => p.name === f?.name), inst).length) {
      setPendingLog(min);
      return;
    }
    success();
    store.logMinutes(min, f?.name ?? 'Quick log', f?.kind ?? 'Logged', day, undefined, on || inst || undefined);
    const name = f?.name;
    if (day !== store.today) {
      const when = dayLabel(day, store.today, store.t, store.lang);
      store.showToast(name ? store.t('home.addedMinDay', { min, name, day: when }) : store.t('home.addedMinutesDay', { min, day: when }));
      return;
    }
    store.showToast(name ? store.t('home.addedMinFocus', { min, name }) : store.t('home.addedMinutes', { min }));
  };

  // the gauge follows the day picked on the staff, so tapping a note replays that day's arc
  const dayMin = store.minutesByDate[day] ?? 0;

  // twelve weeks of days for the staff, oldest first — it scrolls, and opens on today
  const dow = store.t('logPast.dowLetters');
  const staffDates = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(store.now);
    d.setDate(d.getDate() - (83 - i));
    return d;
  });
  const bars = barsFor(staffDates.map(dateKey), store.minutesByDate, store.sessions, store.melodyKey).map((b, i) => ({ ...b, day: dow[staffDates[i].getDay()], isToday: b.date === store.today }));
  const goalMet = dayMin >= store.dailyGoal;
  const playFrom = (date: string) => {
    const from = bars.findIndex((b) => b.date === date);
    melody.play(bars.slice(Math.max(0, from)), store.dailyGoal, store.melodyKey);
  };
  const dayLog = store.sessions.filter((x) => x.date === day).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const weekTotal = store.week.reduce((a, d) => a + d.min, 0);

  return (
    // top inset lives outside the scroll content so scrolled-off content clips
    // at the status bar instead of drawing under it (#23)
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page}>
        <View style={s.logoRow}>
          <LogoMark size={26} />
          <Text style={[s.wordmark, { flex: 1 }]}>Étude</Text>
          {/* which progress sections show below, and in what order — the body used to carry this button itself */}
          <Pressable style={s.iconBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel={store.t('settings.progressSections')} onPress={() => setLayoutOpen(true)}>
            <SlidersIcon size={18} />
          </Pressable>
          <Pressable testID="open-settings" style={s.iconBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel={store.t('tabs.settings')} onPress={() => router.push('/profile')}>
            <GearIcon size={20} />
          </Pressable>
        </View>

        <Text style={s.dateOverline}>
          {new Date(store.now).toLocaleDateString(store.lang, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={s.greeting}>{greeting(store.now, store.t)}</Text>
        {store.streakMode !== 'off' && store.displayStreak > 0 && (
          <View style={s.streakRow}>
            <FlameIcon size={13} />
            <Text style={s.streakText}>{store.t('home.streakLine', { count: store.displayStreak })}</Text>
          </View>
        )}

        <View style={{ marginTop: 40 }}>
          <View style={s.overlineRow}>
            <Text style={s.overline}>{dayLabel(day, store.today, store.t, store.lang)}</Text>
            <Text style={s.overlineMeta}>{goalMet ? store.t('progress.goalMet') : store.t('home.minToGo', { min: store.dailyGoal - dayMin })}</Text>
          </View>
          <View style={{ marginTop: 8, alignItems: 'center' }}>
            <FermataMark pct={(dayMin / Math.max(1, store.dailyGoal)) * 100} goalMet={goalMet} />
          </View>
          <View style={s.todayCountRow}>
            <View testID="today-minutes">
              <RollingNumber value={dayMin} style={s.todayCount} height={fs(36)} />
            </View>
            <Text style={s.todayCountUnit}>{store.t('home.minOf', { goal: store.dailyGoal })}</Text>
          </View>
        </View>

        <View style={{ marginTop: 32 }}>
          <View style={s.overlineRow}>
            <Text style={s.overline}>{store.t('progress.last7Days')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* the key lives in Settings; shown here so the accidentals on the staff have a reason */}
              <Pressable hitSlop={8} onPress={() => router.push('/profile')}>
                <Text style={[s.overlineMeta, { color: C.tertiary }]}>{store.t('settings.majorKey', { key: store.melodyKey })}</Text>
              </Pressable>
              <Text style={s.overlineMeta}>{fmtTime(weekTotal, store.t)}</Text>
              {/* plays from the selected bar to today; pause remembers the bar it stopped on, a tap on a bar restarts there */}
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={store.t(melody.playing ? 'metronome.stop' : 'home.playMelody')}
                onPress={() => {
                  tap();
                  if (melody.playing) {
                    setResumeAt(melody.playing);
                    return melody.stop();
                  }
                  playFrom(resumeAt ?? day);
                }}>
                <Text style={s.playGlyph}>{melody.playing ? '❚❚' : '▶'}</Text>
              </Pressable>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={store.t('home.fullScore')}
                onPress={() => {
                  tap();
                  router.push('/score');
                }}>
                <ExpandIcon size={15} color={C.accent} />
              </Pressable>
            </View>
          </View>
          <View style={{ marginTop: 16 }}>
            <MelodyStaff
              bars={bars}
              goal={store.dailyGoal}
              melodyKey={store.melodyKey}
              selected={day}
              sounding={melody.playing ?? undefined}
              onSelect={(d) => {
                tap();
                setPickedDay(d);
                setResumeAt(null);
                if (melody.playing) playFrom(d);
              }}
            />
          </View>
          <Text style={[s.tapHint, { marginTop: 10, textAlign: 'center' }]}>{store.t('home.staffHint')}</Text>
          {/* the staff says a lot in very little space; this is where that is spelled out */}
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 }}
            onPress={() => {
              tap();
              setLegendOpen(true);
            }}>
            <Text style={[s.tapHint, { color: C.accent }]}>{store.t('home.staffLegend.title')}</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 32 }}>
          <View style={s.overlineRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={s.overline}>{store.t('home.offTheClock')}</Text>
              {/* the staff below picks the day these minutes land on; tap the pill to come back to today */}
              {day !== store.today && (
                <Pressable hitSlop={8} style={s.dayPill} onPress={() => setPickedDay(null)}>
                  <Text style={s.dayPillText}>{dayLabel(day, store.today, store.t, store.lang)}</Text>
                  <Text style={s.dayPillX}>×</Text>
                </Pressable>
              )}
            </View>
            <Pressable hitSlop={8} onPress={() => setFocusOpen((v) => !v)} style={[s.focusToggle, { flexShrink: 1 }]}>
              <Text style={s.focusToggleText} numberOfLines={1}>
                {store.quickLogFocus ? store.quickLogFocus.name : store.t('home.chooseFocus')}
              </Text>
              <Text style={s.focusChevron}>⌄</Text>
            </Pressable>
          </View>
          {focusOpen && (
            <View style={s.chipWrap}>
              <Pressable
                style={[s.chip, !store.quickLogFocus && s.chipSel]}
                onPress={() => {
                  store.updateSettings({ quickLogFocus: null });
                  setFocusOpen(false);
                }}>
                <Text style={[s.chipText, !store.quickLogFocus && { color: C.accent }]}>{store.t('home.nothingSpecific')}</Text>
              </Pressable>
              {focusOptions.map((f) => {
                const sel = store.quickLogFocus?.name === f.name && store.quickLogFocus.kind === f.kind;
                return (
                  <Pressable
                    key={`${f.kind}:${f.name}`}
                    style={[s.chip, sel && s.chipSel]}
                    onPress={() => {
                      store.updateSettings({ quickLogFocus: f });
                      setFocusOpen(false);
                    }}>
                    <Text style={[s.chipText, sel && { color: C.accent }]}>{f.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={s.addRow}>
            {store.quickLog.slice(0, 3).map((m) => (
              <Pressable testID={`quick-log-${m}`} key={m} style={s.addBtn} onPress={() => quickLog(m)}>
                <Text style={s.addBtnText}>{store.t('home.chipMin', { min: m })}</Text>
              </Pressable>
            ))}
            {/* the chips log to whichever day the staff above has picked — this
                says so, right where the tap lands, not just in the overline above */}
            {day !== store.today && (
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(200)} style={s.landTag}>
                <Text style={s.landTagText} numberOfLines={1}>
                  {'→ '}
                  {dayLabel(day, store.today, store.t, store.lang)}
                </Text>
              </Animated.View>
            )}
          </View>
          <Text style={s.tapHint}>{day === store.today ? store.t('home.landsToday') : store.t('home.landsOnDay', { day: dayLabel(day, store.today, store.t, store.lang) })}</Text>
        </View>

        <View style={{ marginTop: 32 }}>
          <View style={s.overlineRow}>
            <Text style={s.overline}>{dayLabel(day, store.today, store.t, store.lang)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={s.tapHint}>{store.t('home.tapToAdjust')}</Text>
              <Pressable hitSlop={8} onPress={() => setPastOpen(true)}>
                <Text style={s.manualLink}>{store.t('practice.logPast')}</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ marginTop: 4 }}>
            {dayLog.map((l) => {
              return (
                <View key={l.id} style={s.logRowWrap}>
                  {/* the full session editor — focus, minutes, rating, note — same as on the piece page */}
                  <Pressable style={s.logRow} onPress={() => setEditSess(l)}>
                    {/* backdated logs carry no time of day (store.logMinutes), so the column collapses rather than gaping */}
                    {!!l.at && <Text style={s.logTime}>{new Date(l.at).toLocaleTimeString(store.lang, { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>}
                    <Text style={s.logTitle} numberOfLines={1}>
                      {l.title}
                    </Text>
                    <Text style={s.logMin}>
                      {l.min}
                      <Text style={s.logMinUnit}> {store.t('home.minWord')}</Text>
                    </Text>
                    <Pressable hitSlop={8} style={s.logDelete} onPress={() => store.deleteSession(l.id)}>
                      <Text style={s.logDeleteText}>×</Text>
                    </Pressable>
                  </Pressable>
                </View>
              );
            })}
            {dayLog.length === 0 && (
              <Text style={s.logEmpty}>{day === store.today ? store.t('home.nothingLoggedToday') : store.t('home.nothingLoggedDay')}</Text>
            )}
          </View>
        </View>

        {/* everything below is the progress registry — Moving, goals, calendar, charts —
            so the Customise sheet actually governs what shows here (#progress layout) */}
        <View style={{ marginTop: 40, gap: 26 }}>
          <ProgressBody showEmpty={false} />
        </View>
      </ScrollView>
      <LogPastModal visible={pastOpen} onClose={() => setPastOpen(false)} />
      <InstrumentAsk
        visible={pendingLog !== null}
        name={store.quickLogFocus?.name ?? ''}
        choices={instrumentChoices(store.allPieces.find((p) => p.name === store.quickLogFocus?.name), inst)}
        onClose={() => setPendingLog(null)}
        onPick={(on) => {
          const min = pendingLog;
          setPendingLog(null);
          if (min) quickLog(min, on);
        }}
      />
      <ProgressLayoutSheet visible={layoutOpen} onClose={() => setLayoutOpen(false)} />
      <StaffLegend visible={legendOpen} onClose={() => setLegendOpen(false)} />
      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
    </View>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  logoRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  wordmark: { fontFamily: F.head, fontSize: fs(16), color: C.ink, letterSpacing: -0.16, marginLeft: 8 },
  dateOverline: { marginTop: 32, fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  greeting: { marginTop: 8, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  streakRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakText: { fontFamily: F.body, fontSize: fs(17), lineHeight: fs(24), color: C.subStrong },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  overlineRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  overline: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  overlineMeta: { fontFamily: F.body, fontSize: fs(15), color: C.subStrong },
  playGlyph: { fontSize: fs(14), lineHeight: fs(18), color: C.accent },
  todayCountRow: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  todayCount: { fontFamily: F.head, fontSize: fs(34), lineHeight: fs(36), letterSpacing: -0.8, color: C.ink, fontVariant: ['tabular-nums'] },
  todayCountUnit: { fontFamily: F.body, fontSize: fs(18), color: C.subStrong },
  focusToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.accentTint },
  dayPillText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.accent },
  dayPillX: { fontFamily: F.body, fontSize: fs(13), color: C.accent, lineHeight: fs(15) },
  manualLink: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  focusToggleText: { fontFamily: F.accent, fontSize: fs(17), color: C.accent },
  focusChevron: { fontSize: fs(13), color: C.accent, transform: [{ scaleY: 0.7 }] },
  chipWrap: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  addRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  addBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  landTag: { height: 36, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  landTagText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  tapHint: { fontFamily: F.body, fontSize: fs(13), color: C.tertiary },
  logRowWrap: { borderBottomWidth: 1, borderBottomColor: C.hairline },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  logTime: { width: 40, fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, fontVariant: ['tabular-nums'] },
  logTitle: { flex: 1, minWidth: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  logMin: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink, fontVariant: ['tabular-nums'] },
  logMinUnit: { fontFamily: F.body, fontWeight: '400', color: C.sub },
  logDelete: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logDeleteText: { fontSize: fs(16), lineHeight: fs(16), color: C.tertiary },
  logEmpty: { height: 52, textAlignVertical: 'center', fontFamily: F.body, fontSize: fs(15), color: C.tertiary },
  movingAll: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 64, borderBottomWidth: 1, borderBottomColor: C.hairline },
  moveBar: { width: 1.5, height: 32, backgroundColor: C.barline },
  moveName: { fontFamily: F.bodyMed, fontSize: fs(16), lineHeight: fs(22), color: C.ink },
  moveText: { fontFamily: F.body, fontSize: fs(15), lineHeight: fs(20) },
  moveDot: { width: 7, height: 7, borderRadius: 3.5 },
  weekGoalValue: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  weekGoalNote: { marginTop: 12, fontFamily: F.body, fontSize: fs(15), lineHeight: fs(20) },
  customise: { textAlign: 'center', fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
}));
