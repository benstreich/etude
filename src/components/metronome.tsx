import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { RollingNumber } from '@/components/motifs';
import { Text } from '@/components/text';
import { LOCK_SCREEN_STEP, previewClick, useBeat, useMetronome } from '@/lib/metronome';
import { describeRamp, MAX_BPM, SOUND_SETS, SUBDIVS, tapTempo, type RampUnit, type SoundSet } from '@/lib/metronome-math';
import { useStore } from '@/lib/store';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const UNITS: RampUnit[] = ['bars', 'seconds'];
const UNIT_KEY: Record<RampUnit, string> = { bars: 'metronome.bars', seconds: 'metronome.seconds' };
const UNIT_ONE_KEY: Record<RampUnit, string> = { bars: 'metronome.bar', seconds: 'metronome.second' };
const TIME_SIGS = ['1/4', '2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
// "2 per beat", not "eighths": in 6/8 a beat is already an eighth, so note names lie
const SUBDIV_KEY: Record<number, string> = {
  1: 'metronome.subdivOff',
  2: 'metronome.subdiv2',
  3: 'metronome.subdiv3',
  4: 'metronome.subdiv4',
};
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
  const C = useC();
  const { fs } = useTheme(); // the roll travels exactly one line height per digit
  const { t } = useStore();
  const metronome = useMetronome();
  const { running, bpm, startBpm, timeSig, ramp, subdiv, accents, sound, volume } = metronome;
  const { toggle, setBpm, nudge, setTimeSig, setRamp, setSubdiv, cycleAccent, setSound, setVolume } = metronome;
  const beat = useBeat();
  const taps = useRef<number[]>([]);

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            <Text style={s.sheetTitle}>{t('metronome.metronome')}</Text>

            {/* tap a dot to cycle its accent: accent → mid → plain → muted (#57) */}
            <View style={s.dots}>
              {accents.map((level, i) => (
                <Pressable key={i} hitSlop={6} onPress={() => cycleAccent(i)}>
                  <View
                    style={[
                      s.dot,
                      level === 3 && s.dotDown,
                      level === 2 && s.dotMid,
                      level === 0 && s.dotMuted,
                      running && beat === i && (level === 3 ? s.dotDownLit : level === 0 ? s.dotMutedLit : s.dotLit),
                    ]}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={[s.hint, { textAlign: 'center', marginTop: -12 }]}>{t('metronome.accentsHint')}</Text>

            <View style={s.bpmRow}>
              <Step label="−5" onPress={() => nudge(-5)} />
              <Step label="−1" onPress={() => nudge(-1)} />
              <View style={s.bpmBox}>
                <View testID="metro-bpm">
                  <RollingNumber value={bpm} style={s.bpm} height={fs(60)} />
                </View>
                <Text style={s.bpmUnit}>BPM</Text>
                <Text style={s.bpmTerm}>{tempoTerm(bpm)}</Text>
              </View>
              <Step label="+1" onPress={() => nudge(1)} />
              <Step label="+5" onPress={() => nudge(5)} />
            </View>

            <View style={s.actions}>
              <Pressable style={s.tapBtn} onPress={tap}>
                <Text style={s.tapBtnText}>{t('metronome.tapTempo')}</Text>
              </Pressable>
              <Pressable style={[s.playBtn, running && s.playBtnOn]} onPress={toggle}>
                <Text style={[s.playBtnText, running && { color: C.bg }]}>{running ? t('metronome.stop') : t('metronome.start')}</Text>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={s.label}>{t('metronome.timeSignature')}</Text>
              <View style={s.chipRow}>
                {TIME_SIGS.map((ts) => (
                  <Pressable
                    key={ts}
                    style={[s.chip, timeSig === ts && s.chipSel]}
                    onPress={() => setTimeSig(ts)}>
                    <Text style={[s.chipText, timeSig === ts && { color: C.accent }]}>{ts}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.hint}>{t('metronome.compoundHint')}</Text>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={s.label}>{t('metronome.subdivision')}</Text>
              <View style={s.seg}>
                {SUBDIVS.map((n, i) => (
                  <Pressable
                    key={n}
                    style={[s.segBtn, i > 0 && s.segBtnDivider, subdiv === n && s.segBtnSel]}
                    onPress={() => setSubdiv(n)}>
                    <Text style={[s.segText, subdiv === n && s.segTextSel]}>{t(SUBDIV_KEY[n])}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={s.label}>{t('metronome.sound')}</Text>
              <View style={s.chipRow}>
                {SOUND_SETS.map((id) => (
                  <Pressable
                    key={id}
                    style={[s.chip, sound === id && s.chipSel]}
                    onPress={() => {
                      setSound(id);
                      // a picker you can't hear is a guessing game — preview on every tap
                      if (!running) previewClick(id, volume);
                    }}>
                    <Text style={[s.chipText, sound === id && { color: C.accent }]}>{t(SOUND_KEY[id])}</Text>
                  </Pressable>
                ))}
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
                <View style={[s.switchTrack, ramp.on && s.switchTrackOn]}>
                  <View style={[s.switchKnob, ramp.on && s.switchKnobOn]} />
                </View>
              </Pressable>

              {ramp.on && (
                <View style={{ gap: 10 }}>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.changeBy')}</Text>
                    <NumberField value={ramp.step} onCommit={(step) => setRamp({ step })} />
                    <Text style={s.fieldSuffix}>BPM</Text>
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.every')}</Text>
                    <NumberField value={ramp.every} onCommit={(every) => setRamp({ every })} />
                    <View style={s.seg}>
                      {UNITS.map((unit, i) => (
                        <Pressable
                          key={unit}
                          style={[s.segBtn, i > 0 && s.segBtnDivider, ramp.unit === unit && s.segBtnSel]}
                          onPress={() => setRamp({ unit })}>
                          <Text style={[s.segText, ramp.unit === unit && s.segTextSel]}>{t(UNIT_KEY[unit])}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.until')}</Text>
                    <NumberField value={ramp.target} onCommit={(target) => setRamp({ target })} />
                    <Text style={s.fieldSuffix}>BPM</Text>
                  </View>
                  <Text style={s.hint}>{t('metronome.rampDownHint')}</Text>
                </View>
              )}
            </View>

            <Text style={s.hint}>{t('metronome.backgroundHint', { step: LOCK_SCREEN_STEP })}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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

const Step = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const s = useS();
  return (
    <Pressable style={s.step} hitSlop={6} onPress={onPress}>
      <Text style={s.stepText}>{label}</Text>
    </Pressable>
  );
};

/** Numeric field that only writes through once editing ends, so typing doesn't hit storage. */
function NumberField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const s = useS();
  const [text, setText] = useState(String(value));
  // adjust-state-during-render pattern (react.dev "you might not need an effect")
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(String(value));
  }
  const commit = () => {
    const parsed = Math.round(Number(text));
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_BPM) onCommit(parsed);
    else setText(String(value));
  };
  return (
    <TextInput
      style={s.numberField}
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="number-pad"
      returnKeyType="done"
      maxLength={3}
      selectTextOnFocus
    />
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  pill: { height: 44, paddingHorizontal: 18, borderRadius: r(999), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pillCompact: { height: 36, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.accent, borderColor: C.accent },
  pillText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },

  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },

  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: r(5), backgroundColor: C.track },
  dotDown: { width: 14, height: 14, borderRadius: r(7) },
  dotMid: { width: 12, height: 12, borderRadius: r(6) },
  dotMuted: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.track },
  dotLit: { backgroundColor: C.faint },
  dotDownLit: { backgroundColor: C.accent },
  dotMutedLit: { borderColor: C.faint },

  volTrack: { height: 12, borderRadius: r(999), backgroundColor: C.track, overflow: 'hidden', justifyContent: 'center' },
  volFill: { height: 12, borderRadius: r(999), backgroundColor: C.accent },

  bpmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bpmBox: { alignItems: 'center', minWidth: 96 },
  bpm: { fontFamily: F.head, fontSize: fs(54), color: C.ink, fontVariant: ['tabular-nums'], lineHeight: fs(60) },
  bpmUnit: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.4, color: C.tertiary },
  bpmTerm: { fontFamily: F.accentMed, fontSize: fs(15), color: C.accent, marginTop: 2 },
  step: { width: 42, height: 42, borderRadius: r(21), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },

  actions: { flexDirection: 'row', gap: 12 },
  tapBtn: { flex: 1, height: 52, borderRadius: r(14), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  tapBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink },
  playBtn: { flex: 1, height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  playBtnOn: { backgroundColor: C.accent },
  playBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },

  label: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  hint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, lineHeight: fs(17) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 44, height: 40, paddingHorizontal: 12, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },

  // joined segmented control: one bordered container, selected half tinted -
  // deliberately unlike the loose chips above, which mean a many-way pick
  seg: { flexDirection: 'row', height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  segBtnDivider: { borderLeftWidth: 1, borderLeftColor: C.inputBorder },
  segBtnSel: { backgroundColor: C.accentTint },
  segText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.sub },
  segTextSel: { color: C.accent, fontFamily: F.bodySemi },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTrack: { width: 46, height: 28, borderRadius: r(14), backgroundColor: C.track, padding: 3 },
  switchTrackOn: { backgroundColor: C.accent },
  switchKnob: { width: 22, height: 22, borderRadius: r(11), backgroundColor: C.card },
  switchKnobOn: { alignSelf: 'flex-end' },

  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink, width: 84 },
  fieldSuffix: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  numberField: { width: 72, height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 12, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink, textAlign: 'center' },
}));
