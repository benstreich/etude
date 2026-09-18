// Session review — full-screen moment after the timer stops (#17), replacing
// the plain note prompt. Shows the day's progress on a staff, achievement chips,
// a note field, and can attach a take via the practice screen's recorder.
import React, { useEffect, useState } from 'react';
import { Animated, Modal, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlameIcon } from '@/components/icons';
import { FermataMark, WaveformIcon } from '@/components/motifs';
import { Text } from '@/components/text';
import { EntryRow, Overline, Stars } from '@/components/ui';
import { achievements } from '@/lib/growth-math';
import { cueVoice, primaryOf } from '@/lib/cue-voice';
import { pieceRatings } from '@/lib/rating-math';
import { maybeRequestReview } from '@/lib/review';
import { playSessionComplete } from '@/lib/sounds';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

export type ReviewSession = { id: string; min: number; focusName: string; start: number; end: number };

export function SessionReview({
  session,
  onClose,
  onToggleTake,
  onImportTake,
  recording = false,
}: {
  session: ReviewSession | null;
  onClose: () => void;
  /** Toggles the caller's recorder; omit to hide the "Attach take" button. */
  onToggleTake?: () => void;
  onImportTake?: () => void;
  recording?: boolean;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useTheme();
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [rise] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const soundsOn = store.sounds;
  const voice = cueVoice(primaryOf(store.instruments, store.primaryInstrument));
  // last rating for this focus, so the grade is relative to last time (spec 2026-09-15)
  const lastRating = session ? pieceRatings({ name: session.focusName }, store.sessions.filter((x) => x.id !== session.id)).at(-1)?.rating : undefined;

  // reset the draft whenever a new session opens the review
  const [prevId, setPrevId] = useState<string | null>(null);
  if (session && session.id !== prevId) {
    setPrevId(session.id);
    setNote('');
    setRating(undefined);
  }

  // the soul-pass moment: content rises in, the completion cue plays once
  const openId = session?.id ?? null;
  useEffect(() => {
    if (!openId) return;
    rise.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) Animated.timing(rise, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    playSessionComplete(soundsOn, voice);
  }, [openId, reduceMotion, rise, soundsOn, voice]);

  const chips = session
    ? achievements({
        streak: store.displayStreak,
        sessionCount: store.sessions.length,
        minutesByDate: store.minutesByDate,
        dailyGoal: store.dailyGoal,
        today: store.today,
      })
    : [];
  // "Best week yet" is an earned moment (#68): ask for a review once the chord has
  // played and the chips are on screen, never on top of the save button
  const bestWeek = chips.some((c) => c.label === 'Best week yet');
  useEffect(() => {
    if (!openId || !bestWeek) return;
    const t = setTimeout(() => maybeRequestReview(store), 2500);
    return () => clearTimeout(t);
  }, [openId, bestWeek, store]);

  if (!session) return null;

  const time = (t: number) => new Date(t).toLocaleTimeString(store.lang, { hour: 'numeric', minute: '2-digit' });

  // achievements() returns English labels (asserted by scripts/check-growth.ts,
  // which runs without the i18n runtime) — localize at display time instead
  const MILESTONE_KEYS: Record<string, string> = {
    'First session': 'sessionReview.firstSession',
    'Best week yet': 'sessionReview.bestWeek',
    'Goal hit 7 days straight': 'sessionReview.goalStraight',
  };
  const chipText = (c: (typeof chips)[number]) =>
    c.kind === 'streak'
      ? store.t('home.streakLine', { count: store.displayStreak })
      : MILESTONE_KEYS[c.label]
        ? store.t(MILESTONE_KEYS[c.label])
        : c.label;

  const close = () => {
    if (note.trim()) store.setSessionNote(session.id, note);
    if (rating) store.updateSession(session.id, { rating });
    onClose();
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAwareScrollView
          bottomOffset={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.page, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
          <View style={s.topRow}>
            <Overline>{store.t('sessionReview.title')}</Overline>
            <Pressable hitSlop={10} onPress={close}>
              <Text style={s.done}>{store.t('sessionReview.done')}</Text>
            </Pressable>
          </View>

          <Animated.View
            style={{
              alignItems: 'center',
              gap: 6,
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}>
            <FermataMark pct={store.dailyGoal > 0 ? (store.todayMin / store.dailyGoal) * 100 : 100} goalMet={store.todayMin >= store.dailyGoal} size={200} />
            <Text style={s.ringMin}>
              {store.todayMin}{' '}
              <Text style={s.ringGoal}>{store.t('sessionReview.ofGoalMin', { goal: store.dailyGoal })}</Text>
            </Text>
            <View style={{ alignItems: 'center', gap: 5, marginTop: 22 }}>
              <Text style={s.title}>{store.name ? store.t('sessionReview.niceWorkName', { name: store.name }) : store.t('sessionReview.niceWork')}</Text>
              <Text style={s.meta}>
                {session.focusName} · {time(session.start)} – {time(session.end)}
              </Text>
            </View>
            {chips.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                {chips.map((c, i) => (
                  <React.Fragment key={c.label}>
                    {i > 0 && <Text style={s.chipSep}>|</Text>}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {c.kind === 'streak' && <FlameIcon />}
                      <Text style={s.meta}>{chipText(c)}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            )}
          </Animated.View>

          {/* optional 1–5 rating (#54): unrated stays unrated, no nag */}
          <View style={{ alignItems: 'center', gap: 8, marginTop: 'auto' }}>
            <Overline>{store.t('sessionReview.rateSession')}</Overline>
            <Stars value={rating} onChange={setRating} />
            {lastRating !== undefined && <Text style={s.meta}>{store.t('sessionReview.lastTime', { n: lastRating })}</Text>}
          </View>

          <View style={{ marginTop: 0 }}>
            <Overline>{store.t('sessionReview.note')}</Overline>
            <View style={s.noteCard}>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={store.t('sessionReview.notePlaceholder')}
                placeholderTextColor={C.tertiary}
                multiline
              />
            </View>
          </View>

          <EntryRow
            top
            close
            keyStyle={{ backgroundColor: C.accent }}
            keyContent={
              <Svg width={18} height={14} viewBox="0 0 18 14">
                <Path d="M2 7.5 6.5 12 16 2" stroke={C.bg} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            }
            testID="review-save"
            title={store.t('sessionReview.saveSession')}
            right={
              onToggleTake ? (
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Pressable style={s.takeBtn} onPress={onToggleTake} hitSlop={8}>
                    {recording ? <View style={s.recDot} /> : <WaveformIcon />}
                    <Text style={[s.takeText, recording && { color: C.accent }]}>
                      {recording ? store.t('sessionReview.stopTake') : store.t('sessionReview.attachTake')}
                    </Text>
                  </Pressable>
                  {/* a take doesn't have to come from this phone's mic */}
                  {onImportTake && !recording && (
                    <Pressable onPress={onImportTake} hitSlop={8}>
                      <Text style={s.importText}>{store.t('sessionReview.importTake')}</Text>
                    </Pressable>
                  )}
                </View>
              ) : null
            }
            onPress={close}
          />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 24, gap: 26 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  done: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  ringMin: { fontFamily: F.head, fontSize: fs(34), lineHeight: fs(36), letterSpacing: -0.8, color: C.ink, fontVariant: ['tabular-nums'] },
  ringGoal: { fontFamily: F.body, fontSize: fs(18), color: C.subStrong },
  title: { fontFamily: F.head, fontSize: fs(30), lineHeight: fs(36), color: C.ink, letterSpacing: -0.4, textAlign: 'center' },
  meta: { fontFamily: F.body, fontSize: fs(14), color: C.subStrong },
  chipSep: { color: C.staffLine },
  noteCard: { marginTop: 4, minHeight: 64, borderTopWidth: 1, borderTopColor: C.staffLine, paddingTop: 8 },
  noteInput: { flex: 1, fontFamily: F.body, fontSize: fs(17), lineHeight: fs(32), color: C.ink, padding: 0, textAlignVertical: 'top' },
  takeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  takeText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  importText: { fontFamily: F.bodyMed, fontSize: fs(12.5), color: C.sub },
}));
