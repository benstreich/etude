// Session review — full-screen moment after the timer stops (#17), replacing
// the plain note prompt. Shows the day's progress on a staff, achievement chips,
// a note field, and can attach a take via the practice screen's recorder.
import React, { useEffect, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FlameIcon } from '@/components/icons';
import { StaffProgress, WaveformIcon } from '@/components/motifs';
import { Text } from '@/components/text';
import { Stars } from '@/components/ui';
import { achievements } from '@/lib/growth-math';
import { cueVoice, primaryOf } from '@/lib/cue-voice';
import { maybeRequestReview } from '@/lib/review';
import { playSessionComplete } from '@/lib/sounds';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

export type ReviewSession = { id: string; min: number; focusName: string; start: number; end: number };

export function SessionReview({
  session,
  onClose,
  onToggleTake,
  recording = false,
}: {
  session: ReviewSession | null;
  onClose: () => void;
  /** Toggles the caller's recorder; omit to hide the "Attach take" button. */
  onToggleTake?: () => void;
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
      ? store.t('sessionReview.streakChip', { count: store.displayStreak })
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
          <View style={s.topRow}>
            <View style={{ width: 44 }} />
            <Pressable hitSlop={10} onPress={close}>
              <Text style={s.done}>{store.t('sessionReview.done')}</Text>
            </Pressable>
          </View>

          <Animated.View
            style={{
              alignItems: 'center',
              gap: 22,
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}>
            <View style={{ alignItems: 'center', gap: 18 }}>
              <Text style={s.ringMin}>
                {store.todayMin}{' '}
                <Text style={s.ringGoal}>{store.t('sessionReview.ofGoalMin', { goal: store.dailyGoal })}</Text>
              </Text>
              <StaffProgress pct={store.dailyGoal > 0 ? (store.todayMin / store.dailyGoal) * 100 : 100} />
            </View>
            <View style={{ alignItems: 'center', gap: 5 }}>
              <Text style={s.title}>{store.name ? store.t('sessionReview.niceWorkName', { name: store.name }) : store.t('sessionReview.niceWork')}</Text>
              <Text style={s.meta}>
                {session.focusName} · {time(session.start)} – {time(session.end)}
              </Text>
            </View>
            {chips.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {chips.map((c) => (
                  <View key={c.label} style={c.kind === 'streak' ? s.chipTint : s.chipOutline}>
                    {c.kind === 'streak' && <FlameIcon />}
                    <Text style={c.kind === 'streak' ? s.chipTintText : s.chipOutlineText}>{chipText(c)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* optional 1–5 rating (#54): unrated stays unrated, no nag */}
          <View style={{ alignItems: 'center', gap: 8, marginTop: 'auto' }}>
            <Text style={s.meta}>{store.t('sessionReview.rateSession')}</Text>
            <Stars value={rating} onChange={setRating} />
          </View>

          <View style={[s.noteCard, { marginTop: 0 }]}>
            <Text style={s.pencil}>✎</Text>
            <TextInput
              style={[s.noteInput, !note && s.noteIdle]}
              value={note}
              onChangeText={setNote}
              placeholder={store.t('sessionReview.notePlaceholder')}
              placeholderTextColor={C.tertiary}
              multiline
            />
          </View>

          <View style={s.bottomRow}>
            {onToggleTake && (
              <Pressable style={[s.takeBtn, recording && { borderColor: C.accent }]} onPress={onToggleTake}>
                {recording ? <View style={[s.recDot, { backgroundColor: C.accent }]} /> : <WaveformIcon />}
                <Text style={[s.takeText, recording && { color: C.accent }]}>
                  {recording ? store.t('sessionReview.stopTake') : store.t('sessionReview.attachTake')}
                </Text>
              </Pressable>
            )}
            <Pressable style={s.saveBtn} onPress={close}>
              <Text style={s.saveText}>{store.t('sessionReview.saveSession')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 24, gap: 26 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  done: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  noteIdle: { fontFamily: F.accent, fontSize: fs(15.5) },
  ringMin: { fontFamily: F.head, fontSize: fs(48), color: C.ink, lineHeight: fs(52), letterSpacing: -0.5 },
  ringGoal: { fontFamily: F.accent, fontSize: fs(20), color: C.subStrong },
  title: { fontFamily: F.head, fontSize: fs(30), color: C.ink, letterSpacing: -0.3 },
  meta: { fontFamily: F.body, fontSize: fs(14.5), color: C.subStrong },
  chipTint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 8, paddingHorizontal: 14 },
  chipTintText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  chipOutline: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.inputBorder, borderRadius: r(999), paddingVertical: 8, paddingHorizontal: 14 },
  chipOutlineText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.ink },
  noteCard: { flexDirection: 'row', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: r(16), padding: 16, minHeight: 84, marginTop: 'auto' },
  pencil: { fontSize: fs(16), color: C.accent, lineHeight: fs(22) },
  noteInput: { flex: 1, fontFamily: F.body, fontSize: fs(15), color: C.ink, padding: 0, textAlignVertical: 'top' },
  bottomRow: { flexDirection: 'row', gap: 12 },
  takeBtn: { flex: 1, height: 52, borderRadius: r(14), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: r(4), backgroundColor: C.sub },
  takeText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  saveBtn: { flex: 1.4, height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
