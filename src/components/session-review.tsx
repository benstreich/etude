// Session review — full-screen moment after the timer stops (#17), replacing
// the plain note prompt. Shows the day's goal ring, achievement chips, a note
// field, and can attach a take via the practice screen's recorder.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { FlameIcon } from '@/components/icons';
import { achievements } from '@/lib/growth-math';
import { mix } from '@/lib/heatmap-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

export type ReviewSession = { id: string; min: number; focusName: string; start: number; end: number };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 150;
const STROKE = 11;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function GoalRing({ min, goal }: { min: number; goal: number }) {
  const C = useC();
  const s = useS();
  const { reduceMotion } = useTheme();
  const pct = goal > 0 ? min / goal : 1;
  const base = Math.min(1, pct);
  const extra = Math.min(1, Math.max(0, pct - 1)); // overflow lap past 100%
  const sweep = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (!reduceMotion)
      Animated.timing(sweep, { toValue: 1, duration: 900, useNativeDriver: false }).start();
  }, [reduceMotion, sweep]);
  const offset = (frac: number) =>
    sweep.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * (1 - frac)] });
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={C.track} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={RING / 2} cy={RING / 2} r={R} stroke={C.accent} strokeWidth={STROKE} fill="none"
          strokeLinecap="round" strokeDasharray={`${CIRC}`} strokeDashoffset={offset(base)}
        />
        {extra > 0 && (
          <AnimatedCircle
            cx={RING / 2} cy={RING / 2} r={R} stroke={mix(C.accent, C.bg, 0.45)} strokeWidth={STROKE} fill="none"
            strokeLinecap="round" strokeDasharray={`${CIRC}`} strokeDashoffset={offset(extra)}
          />
        )}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={s.ringMin}>{min}</Text>
        <Text style={s.ringGoal}>of {goal} min</Text>
      </View>
    </View>
  );
}

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
  const [note, setNote] = useState('');

  // reset the draft whenever a new session opens the review
  const [prevId, setPrevId] = useState<string | null>(null);
  if (session && session.id !== prevId) {
    setPrevId(session.id);
    setNote('');
  }

  if (!session) return null;

  const chips = achievements({
    streak: store.displayStreak,
    sessionCount: store.sessions.length,
    minutesByDate: store.minutesByDate,
    dailyGoal: store.dailyGoal,
    today: store.today,
  });

  const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const close = () => {
    if (note.trim()) store.setSessionNote(session.id, note);
    onClose();
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
          <View style={s.topRow}>
            <View style={{ width: 44 }} />
            <Pressable hitSlop={10} onPress={close}>
              <Text style={s.done}>Done</Text>
            </Pressable>
          </View>

          <View style={{ alignItems: 'center', gap: 18 }}>
            <GoalRing min={store.todayMin} goal={store.dailyGoal} />
            <View style={{ alignItems: 'center', gap: 5 }}>
              <Text style={s.title}>{store.name ? `Nice work, ${store.name}` : 'Nice work'}</Text>
              <Text style={s.meta}>
                {session.focusName} · {time(session.start)} – {time(session.end)}
              </Text>
            </View>
            {chips.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {chips.map((c) => (
                  <View key={c.label} style={c.kind === 'streak' ? s.chipTint : s.chipOutline}>
                    {c.kind === 'streak' && <FlameIcon />}
                    <Text style={c.kind === 'streak' ? s.chipTintText : s.chipOutlineText}>{c.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={s.noteCard}>
            <Text style={s.pencil}>✎</Text>
            <TextInput
              style={s.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="How did it go? Add a note…"
              placeholderTextColor={C.tertiary}
              multiline
            />
          </View>

          <View style={s.bottomRow}>
            {onToggleTake && (
              <Pressable style={[s.takeBtn, recording && { borderColor: C.accent }]} onPress={onToggleTake}>
                <View style={[s.recDot, recording && { backgroundColor: C.accent }]} />
                <Text style={[s.takeText, recording && { color: C.accent }]}>
                  {recording ? 'Stop take' : 'Attach take'}
                </Text>
              </Pressable>
            )}
            <Pressable style={s.saveBtn} onPress={close}>
              <Text style={s.saveText}>Save session</Text>
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
  ringMin: { fontFamily: F.head, fontSize: fs(38), color: C.ink, lineHeight: fs(42) },
  ringGoal: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  title: { fontFamily: F.head, fontSize: fs(24), color: C.ink },
  meta: { fontFamily: F.body, fontSize: fs(14.5), color: C.sub },
  chipTint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 8, paddingHorizontal: 14 },
  chipTintText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  chipOutline: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.inputBorder, borderRadius: r(999), paddingVertical: 8, paddingHorizontal: 14 },
  chipOutlineText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.subStrong },
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
