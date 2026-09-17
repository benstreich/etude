// First-run flow: welcome + 4 steps (instruments/name, daily goal, reminders, a tour of the tabs).
// Rendered by Shell instead of the tab navigator until store.onboarded is set.
import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClockIcon, LockIcon, LogoMark, MetronomeIcon, NoteIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { useStore } from '@/lib/store';
import { F, themed, useTheme, type T } from '@/lib/theme';

// Chip VALUES are persisted in settings — translate displayed labels only.
const INSTRUMENTS = ['Piano', 'Guitar', 'Violin', 'Voice', 'Drums', 'Bass', 'Cello'];
const GOALS = [10, 15, 20, 30, 45, 60];
const TIMES = ['6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const TIME_KEYS: Record<string, string> = { '6:00 PM': 'time6pm', '7:00 PM': 'time7pm', '8:00 PM': 'time8pm', '9:00 PM': 'time9pm' };

export function Onboarding() {
  const s = useS();
  const { C, reduceMotion } = useTheme();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0); // 0 welcome, 1 you, 2 goal, 3 reminders, 4 tour
  const [forward, setForward] = useState(true); // which way the last step change went; the new step slides in from that side
  const go = (n: number) => {
    setForward(n >= step);
    setStep(n);
  };
  const [instruments, setInstruments] = useState<string[]>([]);
  const [other, setOther] = useState<string | null>(null); // null = "Other…" chip untapped
  const [name, setName] = useState('');
  // seeded default, not a second number: Skip calls finish() with whatever is
  // here, so a literal would quietly overwrite the goal seed() just set
  const [goal, setGoal] = useState(store.dailyGoal);
  const [time, setTime] = useState('6:00 PM');
  const [reminder, setReminder] = useState('Off'); // the reminder step's answer, saved when the tour ends

  // OS back gesture steps back instead of leaving the app
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      go(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const finish = (reminder: string) => {
    const list = [...instruments, ...(other?.trim() ? [other.trim()] : [])];
    store.updateSettings({
      onboarded: true,
      instruments: list,
      dailyGoal: Math.max(1, goal),
      reminder,
      ...(name.trim() ? { name: name.trim() } : {}),
    });
  };

  const header = (
    <View style={s.topRow}>
      <View style={s.dotsRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[s.dot, i === step && s.dotActive]} />
        ))}
      </View>
      <Pressable hitSlop={10} onPress={() => finish('Off')}>
        <Text style={s.skip}>{store.t('onboarding.skip')}</Text>
      </Pressable>
    </View>
  );

  const primary = (label: string, onPress: () => void) => (
    <Pressable style={({ pressed }) => [s.primaryBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={onPress}>
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );

  if (step === 0)
    return (
      <View style={[s.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={{ flex: 1.1 }} />
        <View style={{ alignItems: 'center', gap: 18 }}>
          <LogoMark size={76} />
          <Text style={s.wordmark}>Étude</Text>
          <Text style={s.tagline}>{store.t('onboarding.tagline')}</Text>
        </View>
        <View style={{ flex: 1.4 }} />
        {primary(store.t('onboarding.getStarted'), () => go(1))}
        <View style={s.lockRow}>
          <LockIcon size={13} color={C.sub} />
          <Text style={s.lockText}>{store.t('onboarding.privacyNote')}</Text>
        </View>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {header}
        <KeyboardAwareScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={16}>
          <Animated.View key={step} entering={reduceMotion ? undefined : (forward ? FadeInRight : FadeInLeft).duration(280)}>
          {step === 1 && (
            <>
              <View style={s.headerBlock}>
                <Text style={s.title}>{store.t('onboarding.instrumentsTitle')}</Text>
                <Text style={s.subline}>{store.t('onboarding.instrumentsSubline')}</Text>
              </View>
              <View style={s.chipWrap}>
                {INSTRUMENTS.map((inst) => {
                  const sel = instruments.includes(inst);
                  return (
                    <Pressable
                      key={inst}
                      style={[s.chip, sel && s.chipSel]}
                      onPress={() => setInstruments((l) => (sel ? l.filter((x) => x !== inst) : [...l, inst]))}>
                      <Text style={[s.chipText, sel && s.chipTextSel]}>{store.t(`onboarding.inst${inst}`)}</Text>
                    </Pressable>
                  );
                })}
                <Pressable style={[s.chip, other !== null && s.chipSel]} onPress={() => setOther(other === null ? '' : null)}>
                  <Text style={[s.chipText, other !== null && s.chipTextSel]}>{store.t('onboarding.other')}</Text>
                </Pressable>
              </View>
              {other !== null && (
                <TextInput
                  style={[s.input, { marginTop: 14 }]}
                  value={other}
                  onChangeText={setOther}
                  placeholder={store.t('onboarding.yourInstrument')}
                  placeholderTextColor={C.tertiary}
                  autoFocus
                />
              )}
              <View style={{ paddingTop: 28 }}>
                <Text style={s.inputLabel}>
                  {store.t('onboarding.yourName')} <Text style={s.optional}>{store.t('onboarding.optional')}</Text>
                </Text>
                <TextInput style={s.input} value={name} onChangeText={setName} placeholder={store.t('onboarding.namePlaceholder')} placeholderTextColor={C.tertiary} />
              </View>
            </>
          )}
          {step === 2 && (
            <>
              <View style={s.headerBlock}>
                <Text style={s.title}>{store.t('onboarding.goalTitle')}</Text>
                <Text style={s.subline}>{store.t('onboarding.goalSubline')}</Text>
              </View>
              <View style={s.bigNumBlock}>
                {/* editable, so any goal is reachable — the chips are just shortcuts (#37) */}
                <TextInput
                  style={s.bigNum}
                  value={String(goal)}
                  onChangeText={(t) => setGoal(Number(t.replace(/\D/g, '').slice(0, 3)))}
                  onBlur={() => {
                    if (goal < 1) setGoal(1);
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  textAlign="center"
                />
                <Text style={s.bigNumCaption}>{store.t('onboarding.minutesADay')}</Text>
              </View>
              <View style={[s.chipWrap, { justifyContent: 'center' }]}>
                {GOALS.map((g) => {
                  const sel = goal === g;
                  return (
                    <Pressable key={g} style={[s.chip, sel && s.chipSel]} onPress={() => setGoal(g)}>
                      <Text style={[s.chipText, sel && s.chipTextSel]}>{g}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {step === 3 && (
            <>
              <View style={s.headerBlock}>
                <Text style={s.title}>{store.t('onboarding.reminderTitle')}</Text>
                <Text style={s.subline}>{store.t('onboarding.reminderSubline')}</Text>
              </View>
              {/* ponytail: preset times instead of a native time picker — matches the
                  Settings reminder options and what reminders.ts can schedule */}
              <View style={s.listCard}>
                <Text style={s.listLabel}>{store.t('onboarding.remindMeAt')}</Text>
                <View style={[s.chipWrap, { marginTop: 12 }]}>
                  {TIMES.map((tm) => {
                    const sel = time === tm;
                    return (
                      <Pressable key={tm} style={[s.chip, sel && s.chipSel]} onPress={() => setTime(tm)}>
                        <Text style={[s.chipText, sel && s.chipTextSel]}>{store.t(`onboarding.${TIME_KEYS[tm]}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}
          {step === 4 && (
            <>
              <View style={s.headerBlock}>
                <Text style={s.title}>{store.t('onboarding.tourTitle')}</Text>
                <Text style={s.subline}>{store.t('onboarding.tourSubline')}</Text>
              </View>
              <View style={[s.listCard, { gap: 18 }]}>
                {(['home', 'practice', 'repertoire', 'tools'] as const).map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={s.tourIcon}>
                      {k === 'home' ? <LogoMark size={24} /> : k === 'practice' ? <ClockIcon size={24} color={C.accent} /> : k === 'repertoire' ? <NoteIcon size={24} color={C.accent} /> : <MetronomeIcon size={24} color={C.accent} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listLabel}>{store.t(`tabs.${k}`)}</Text>
                      <Text style={s.tourLine}>{store.t(`onboarding.tour_${k}`)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
          </Animated.View>
        </KeyboardAwareScrollView>
        {step === 3 ? (
          <View style={{ gap: 6 }}>
            {primary(store.t('onboarding.turnOnReminders'), () => {
              setReminder(time);
              go(4);
            })}
            <Pressable
              style={s.ghostBtn}
              onPress={() => {
                setReminder('Off');
                go(4);
              }}>
              <Text style={s.ghostText}>{store.t('onboarding.notNow')}</Text>
            </Pressable>
          </View>
        ) : step === 4 ? (
          primary(store.t('onboarding.letsGo'), () => finish(reminder))
        ) : (
          primary(store.t('onboarding.continue'), () => go(step + 1))
        )}
      </View>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: r(999), backgroundColor: C.chartInactive },
  dotActive: { width: 20, borderRadius: r(999), backgroundColor: C.accent },
  skip: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.tertiary },
  wordmark: { fontFamily: F.head, fontSize: fs(34), letterSpacing: -0.5, color: C.ink },
  tagline: { fontFamily: F.body, fontSize: fs(16), lineHeight: fs(24), color: C.sub, maxWidth: 280, textAlign: 'center' },
  lockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  lockText: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, textAlign: 'center' },
  headerBlock: { paddingTop: 16, paddingBottom: 28, gap: 8 },
  title: { fontFamily: F.head, fontSize: fs(30), letterSpacing: -0.4, color: C.ink },
  subline: { fontFamily: F.body, fontSize: fs(15), lineHeight: fs(22.5), color: C.sub },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: r(999), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  chipTextSel: { color: '#FFFFFF' },
  input: { height: 52, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  inputLabel: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  optional: { fontFamily: F.body, color: C.tertiary },
  bigNumBlock: { alignItems: 'center', paddingTop: 20, paddingBottom: 32 },
  bigNum: { fontFamily: F.head, fontSize: fs(66), letterSpacing: -1, color: C.accent, padding: 0, minWidth: fs(120) },
  bigNumCaption: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.sub },
  listCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: r(16), padding: 16 },
  listLabel: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  tourIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  tourLine: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(19), color: C.sub, marginTop: 2 },
  primaryBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
  ghostBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.sub },
}));
