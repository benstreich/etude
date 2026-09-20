import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { Pressable } from '@/components/press';

import { PlayIcon } from '@/components/icons';
import { RollingNumber } from '@/components/motifs';
import { Text } from '@/components/text';
import { Bump } from '@/components/motion';
import { ActionChip, EntryRow, Stepper, Switch, UnderlineTabs, useKeyboardLift } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { LOCK_SCREEN_STEP, preloadClicks, previewClick, useBeat, useMetronome } from '@/lib/metronome';
import { describeRamp, MAX_BPM, MIN_BPM, SOUND_SETS, SUBDIVS, tapTempo, type RampUnit, type SoundSet } from '@/lib/metronome-math';
import { useStore } from '@/lib/store';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const UNITS: RampUnit[] = ['bars', 'seconds'];
const UNIT_KEY: Record<RampUnit, string> = { bars: 'metronome.bars', seconds: 'metronome.seconds' };
const UNIT_ONE_KEY: Record<RampUnit, string> = { bars: 'metronome.bar', seconds: 'metronome.second' };
const TIME_SIGS = ['1/4', '2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
// Bare counts, with "clicks per beat" spelled out underneath: "2 per beat" in
// four languages did not fit one row on a phone, and note names would lie
// anyway (in 6/8 a beat is already an eighth).
const SOUND_KEY: Record<SoundSet, string> = {
  wood: 'metronome.soundWood',
  click: 'metronome.soundClick',
  beep: 'metronome.soundBeep',
  soft: 'metronome.soundSoft',
  rim: 'metronome.soundRim',
};

/** Opens the metronome sheet; shows the live tempo once it is running. */
export function MetronomeButton({ compact = false, presetBpm }: { compact?: boolean; presetBpm?: number }) {
  const s = useS();
  const C = useC();
  const { t } = useStore();
  const { running, bpm, setBpm } = useMetronome();
  const [open, setOpen] = useState(false);
  const openSheet = () => {
    if (presetBpm && !running) setBpm(presetBpm);
    setOpen(true);
  };
  return (
    <>
      <Pressable style={[s.pill, compact && s.pillCompact, running && s.pillOn]} onPress={openSheet}>
        <Text style={[s.pillText, running && { color: C.bg }]}>{running ? `♩ ${bpm}` : t('metronome.metronome')}</Text>
      </Pressable>
      <MetronomeSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function MetronomeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const { t } = useStore();
  const lift = useKeyboardLift();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        {/* the ramp's number fields sit low in the sheet; the lift rides the sheet above the keyboard (see ui.tsx) */}
        <Animated.View style={[{ maxHeight: '85%', justifyContent: 'flex-end' }, lift]}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={16} contentContainerStyle={{ gap: 18 }}>
              <Text style={s.sheetTitle}>{t('metronome.metronome')}</Text>
              <MetronomeControls active={visible} />
            </KeyboardAwareScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/**
 * Every metronome control, no chrome: the sheet wraps it in a Modal, the Tools
 * tab's /metronome page lays it out full screen. `active` preloads the click
 * sets the moment the host is shown (#78).
 */
export function MetronomeControls({ active = true }: { active?: boolean }) {
  const s = useS();
  const C = useC();
  const { fs } = useTheme(); // the roll travels exactly one line height per digit
  const { t } = useStore();
  const metronome = useMetronome();
  const { running, bpm, startBpm, timeSig, ramp, subdiv, accents, sound, volume } = metronome;
  const { toggle, setBpm, nudge, setTimeSig, setRamp, setSubdiv, cycleAccent, setSound, setVolume } = metronome;
  const beat = useBeat();
  const taps = useRef<number[]>([]);
  // every sound set ready before the picker is touched (#78)
  useEffect(() => {
    if (active) preloadClicks();
  }, [active]);

  const tap = () => {
    const now = Date.now();
    // a long gap means a new count-in, not a very slow tempo
    taps.current = now - (taps.current.at(-1) ?? 0) > 3000 ? [now] : [...taps.current, now];
    const tapped = tapTempo(taps.current);
    if (tapped) setBpm(tapped);
  };

  // describeRamp gates (null = ramp does nothing); the visible text is built
  // here so it localizes — describeRamp itself stays node-checkable English
  const summary = describeRamp(startBpm, ramp)
    ? t('metronome.rampSummary', {
        count: ramp.every,
        sign: ramp.target > startBpm ? '+' : '−',
        step: ramp.step,
        unit: t(ramp.every === 1 ? UNIT_ONE_KEY[ramp.unit] : UNIT_KEY[ramp.unit]),
        target: ramp.target,
      })
    : null;

  return (
    <>
            {/* tap a dot to cycle its accent: accent → mid → plain → muted (#57) */}
            <View style={s.dots}>
              {accents.map((level, i) => (
                <Pressable key={i} hitSlop={6} onPress={() => cycleAccent(i)}>
                  <Bump trigger={running && beat === i} peak={level === 3 ? 1.5 : 1.3}>
                  <View
                    style={[
                      s.dot,
                      level === 3 && s.dotDown,
                      level === 2 && s.dotMid,
                      level === 0 && s.dotMuted,
                      running && beat === i && (level === 3 ? s.dotDownLit : level === 0 ? s.dotMutedLit : s.dotLit),
                    ]}
                  />
                  </Bump>
                </Pressable>
              ))}
            </View>
            <Text style={[s.hint, { textAlign: 'center', marginTop: 10 }]}>{t('metronome.accentsHint')}</Text>

            <View style={s.bpmRow}>
              <Step label="−5" testID="metro-minus-5" disabled={bpm <= MIN_BPM} onPress={() => nudge(-5)} />
              <Step label="−1" testID="metro-minus-1" disabled={bpm <= MIN_BPM} onPress={() => nudge(-1)} />
              <View style={s.bpmBox}>
                <RollingNumber testID="metro-bpm" value={bpm} style={s.bpm} height={fs(72)} fast />
                <Text style={s.bpmUnit}>BPM</Text>
                <Text style={s.bpmTerm}>{tempoTerm(bpm)}</Text>
              </View>
              <Step label="+1" testID="metro-plus-1" disabled={bpm >= MAX_BPM} onPress={() => nudge(1)} />
              <Step label="+5" testID="metro-plus-5" disabled={bpm >= MAX_BPM} onPress={() => nudge(5)} />
            </View>

            <EntryRow
              testID="metro-start"
              keySize={52}
              keyStyle={running ? { backgroundColor: C.accent } : { borderWidth: 1.5, borderColor: C.ink }}
              keyContent={running ? <View style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: C.bg }} /> : <PlayIcon color={C.ink} />}
              title={running ? t('metronome.stop') : t('metronome.start')}
              right={
                <Pressable hitSlop={8} onPress={tap}>
                  <Text style={s.tapLink}>{t('metronome.tapTempo')}</Text>
                </Pressable>
              }
              close
              onPress={toggle}
            />

            <View>
              <Text style={s.label}>{t('metronome.timeSignature')}</Text>
              <View style={{ marginTop: 8 }}>
                <UnderlineTabs options={TIME_SIGS.map((ts) => ({ key: ts, label: ts }))} value={timeSig} onChange={setTimeSig} gap={12} />
              </View>
              <Text style={[s.hint, { marginTop: 8 }]}>{t('metronome.compoundHint')}</Text>
            </View>

            <View>
              <Text style={s.label}>{t('metronome.subdivision')}</Text>
              <View style={{ marginTop: 8 }}>
                <UnderlineTabs
                  options={SUBDIVS.map((n) => ({ key: String(n), label: n === 1 ? t('metronome.subdivOff') : String(n) }))}
                  value={String(subdiv)}
                  onChange={(v) => setSubdiv(Number(v))}
                  gap={24}
                />
              </View>
              <Text style={[s.hint, { marginTop: 8 }]}>{t('metronome.subdivHint')}</Text>
            </View>

            <View>
              <Text style={s.label}>{t('metronome.sound')}</Text>
              <View style={{ marginTop: 8 }}>
                <UnderlineTabs
                  options={SOUND_SETS.map((id) => ({ key: id, label: t(SOUND_KEY[id]) }))}
                  value={sound}
                  onChange={(id) => {
                    setSound(id);
                    // a picker you can't hear is a guessing game — preview on every tap
                    if (!running) previewClick(id, volume);
                  }}
                  gap={24}
                />
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View style={s.fieldRow}>
                <Text style={[s.label, { flex: 1 }]}>{t('metronome.volume')}</Text>
                <Text style={s.hint}>{volume}%</Text>
              </View>
              <VolumeSlider value={volume} onChange={setVolume} />
            </View>

            <View style={{ gap: 12 }}>
              <Pressable style={s.switchRow} onPress={() => setRamp({ on: !ramp.on })}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{t('metronome.tempoRamp')}</Text>
                  <Text style={s.hint}>{summary ?? t('metronome.rampOffHint')}</Text>
                </View>
                <Switch value={ramp.on} onChange={(on) => setRamp({ on })} />
              </Pressable>

              {ramp.on && (
                <View style={{ gap: 10 }}>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.changeBy')}</Text>
                    <Stepper value={ramp.step} min={1} max={MAX_BPM} size={38} suffix="BPM" onChange={(step) => setRamp({ step })} />
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.every')}</Text>
                    <Stepper value={ramp.every} min={1} max={MAX_BPM} size={38} onChange={(every) => setRamp({ every })} />
                    {UNITS.map((unit) => (
                      <ActionChip
                        key={unit}
                        label={t(UNIT_KEY[unit])}
                        active={ramp.unit === unit}
                        onPress={() => setRamp({ unit })}
                        icon={() => null}
                      />
                    ))}
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.until')}</Text>
                    <Stepper value={ramp.target} min={MIN_BPM} max={MAX_BPM} size={38} suffix="BPM" onChange={(target) => setRamp({ target })} />
                  </View>
                  <Text style={s.hint}>{t('metronome.rampDownHint')}</Text>
                </View>
              )}
            </View>

            <Text style={s.hint}>{t('metronome.backgroundHint', { step: LOCK_SCREEN_STEP })}</Text>
    </>
  );
}

/**
 * 0-100 in one bar. ponytail: the responder props RN already has, like the trim
 * handle in recordings.tsx — no gesture library, no slider dependency.
 */
function VolumeSlider({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  const s = useS();
  const width = useRef(1);
  const at = (x: number) => onChange(Math.round((Math.min(width.current, Math.max(0, x)) / width.current) * 100));
  return (
    <View
      style={s.volTrack}
      onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => at(e.nativeEvent.locationX)}
      onResponderMove={(e) => at(e.nativeEvent.locationX)}>
      <View style={[s.volFill, { width: `${value}%` }]} />
    </View>
  );
}

const Step = ({ label, disabled, onPress, testID }: { label: string; disabled?: boolean; onPress: () => void; testID?: string }) => {
  const s = useS();
  const C = useC();
  return (
    <Pressable
      testID={testID}
      style={s.step}
      hitSlop={6}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}>
      <Text style={[s.stepText, disabled && { color: C.faint }]}>{label}</Text>
    </Pressable>
  );
};

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  pill: { height: 44, paddingHorizontal: 18, borderRadius: r(999), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  pillCompact: { height: 36, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.accent, borderColor: C.accent },
  pillText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },

  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, flexShrink: 1 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },

  dots: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.chartInactive },
  dotDown: { backgroundColor: C.accent },
  dotMid: { backgroundColor: C.faint },
  dotMuted: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.chartInactive },
  dotLit: { backgroundColor: C.faint },
  dotDownLit: { backgroundColor: C.accent },
  dotMutedLit: { borderColor: C.faint },

  volTrack: { height: 12, borderRadius: r(999), backgroundColor: C.track, overflow: 'hidden', justifyContent: 'center' },
  volFill: { height: 12, borderRadius: r(999), backgroundColor: C.accent },

  bpmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bpmBox: { alignItems: 'center', minWidth: 132 },
  bpm: { fontFamily: F.head, fontSize: fs(72), color: C.ink, fontVariant: ['tabular-nums'], lineHeight: fs(72), letterSpacing: -2 },
  bpmUnit: { marginTop: 4, fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  bpmTerm: { fontFamily: F.accent, fontSize: fs(19), color: C.accent, marginTop: 2 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },

  tapLink: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },

  label: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  hint: { fontFamily: F.body, fontSize: fs(14.5), color: C.subStrong, lineHeight: fs(19) },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  fieldLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink, width: 84 },
}));
