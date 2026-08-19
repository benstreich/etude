import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LOCK_SCREEN_STEP, useBeat, useMetronome } from '@/lib/metronome';
import { accentLevel, describeRamp, MAX_BPM, tapTempo, type RampUnit } from '@/lib/metronome-math';
import { C, F } from '@/lib/theme';

const UNITS: RampUnit[] = ['bars', 'seconds'];
const UNIT_LABEL: Record<RampUnit, string> = { bars: 'Bars', seconds: 'Seconds' };
const TIME_SIGS = ['1/4', '2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];

/** Opens the metronome sheet; shows the live tempo once it is running. */
export function MetronomeButton({ compact = false }: { compact?: boolean }) {
  const { running, bpm } = useMetronome();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={[s.pill, compact && s.pillCompact, running && s.pillOn]} onPress={() => setOpen(true)}>
        <Text style={[s.pillText, running && { color: C.bg }]}>{running ? `♩ ${bpm}` : 'Metronome'}</Text>
      </Pressable>
      <MetronomeSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MetronomeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const metronome = useMetronome();
  const { running, bpm, startBpm, timeSig, sig, ramp, toggle, setBpm, nudge, setTimeSig, setRamp } = metronome;
  const beat = useBeat();
  const taps = useRef<number[]>([]);

  const tap = () => {
    const now = Date.now();
    // a long gap means a new count-in, not a very slow tempo
    taps.current = now - (taps.current.at(-1) ?? 0) > 3000 ? [now] : [...taps.current, now];
    const tapped = tapTempo(taps.current);
    if (tapped) setBpm(tapped);
  };

  const summary = describeRamp(startBpm, ramp);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            <Text style={s.sheetTitle}>Metronome</Text>

            <View style={s.dots}>
              {Array.from({ length: sig.beats }, (_, i) => {
                const level = accentLevel(i, sig);
                return (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      level === 2 && s.dotDown,
                      level === 1 && s.dotMid,
                      running && beat === i && (level === 2 ? s.dotDownLit : s.dotLit),
                    ]}
                  />
                );
              })}
            </View>

            <View style={s.bpmRow}>
              <Step label="−5" onPress={() => nudge(-5)} />
              <Step label="−1" onPress={() => nudge(-1)} />
              <View style={s.bpmBox}>
                <Text style={s.bpm} testID="metro-bpm">
                  {bpm}
                </Text>
                <Text style={s.bpmUnit}>BPM</Text>
              </View>
              <Step label="+1" onPress={() => nudge(1)} />
              <Step label="+5" onPress={() => nudge(5)} />
            </View>

            <View style={s.actions}>
              <Pressable style={s.tapBtn} onPress={tap}>
                <Text style={s.tapBtnText}>Tap tempo</Text>
              </Pressable>
              <Pressable style={[s.playBtn, running && s.playBtnOn]} onPress={toggle}>
                <Text style={[s.playBtnText, running && { color: C.bg }]}>{running ? 'Stop' : 'Start'}</Text>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={s.label}>Time signature</Text>
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
              <Text style={s.hint}>6/8, 9/8 and 12/8 pulse in threes: a lighter click marks each group.</Text>
            </View>

            <View style={{ gap: 12 }}>
              <Pressable style={s.switchRow} onPress={() => setRamp({ on: !ramp.on })}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Tempo ramp</Text>
                  <Text style={s.hint}>{summary ?? 'Move the tempo on its own while you play'}</Text>
                </View>
                <View style={[s.switchTrack, ramp.on && s.switchTrackOn]}>
                  <View style={[s.switchKnob, ramp.on && s.switchKnobOn]} />
                </View>
              </Pressable>

              {ramp.on && (
                <View style={{ gap: 10 }}>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>Change by</Text>
                    <NumberField value={ramp.step} onCommit={(step) => setRamp({ step })} />
                    <Text style={s.fieldSuffix}>BPM</Text>
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>Every</Text>
                    <NumberField value={ramp.every} onCommit={(every) => setRamp({ every })} />
                    <View style={s.seg}>
                      {UNITS.map((unit, i) => (
                        <Pressable
                          key={unit}
                          style={[s.segBtn, i > 0 && s.segBtnDivider, ramp.unit === unit && s.segBtnSel]}
                          onPress={() => setRamp({ unit })}>
                          <Text style={[s.segText, ramp.unit === unit && s.segTextSel]}>{UNIT_LABEL[unit]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>Until</Text>
                    <NumberField value={ramp.target} onCommit={(target) => setRamp({ target })} />
                    <Text style={s.fieldSuffix}>BPM</Text>
                  </View>
                  <Text style={s.hint}>A target below the current tempo ramps down instead of up.</Text>
                </View>
              )}
            </View>

            <Text style={s.hint}>
              Keeps playing with the app closed. The lock screen controls move the tempo by {LOCK_SCREEN_STEP} BPM.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const Step = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable style={s.step} hitSlop={6} onPress={onPress}>
    <Text style={s.stepText}>{label}</Text>
  </Pressable>
);

/** Numeric field that only writes through once editing ends, so typing doesn't hit storage. */
function NumberField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
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

const s = StyleSheet.create({
  pill: { height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pillCompact: { height: 36, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.accent, borderColor: C.accent },
  pillText: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink },

  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink },

  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.track },
  dotDown: { width: 14, height: 14, borderRadius: 7 },
  dotMid: { width: 12, height: 12, borderRadius: 6 },
  dotLit: { backgroundColor: C.faint },
  dotDownLit: { backgroundColor: C.accent },

  bpmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bpmBox: { alignItems: 'center', minWidth: 96 },
  bpm: { fontFamily: F.head, fontSize: 52, color: C.ink, fontVariant: ['tabular-nums'], lineHeight: 58 },
  bpmUnit: { fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 1.4, color: C.tertiary },
  step: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },

  actions: { flexDirection: 'row', gap: 12 },
  tapBtn: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  tapBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink },
  playBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  playBtnOn: { backgroundColor: C.accent },
  playBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },

  label: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  hint: { fontFamily: F.body, fontSize: 12.5, color: C.sub, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 44, height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.ink },

  // joined segmented control: one bordered container, selected half tinted -
  // deliberately unlike the loose chips above, which mean a many-way pick
  seg: { flexDirection: 'row', height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  segBtnDivider: { borderLeftWidth: 1, borderLeftColor: C.inputBorder },
  segBtnSel: { backgroundColor: C.accentTint },
  segText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.sub },
  segTextSel: { color: C.accent, fontFamily: F.bodySemi },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTrack: { width: 46, height: 28, borderRadius: 14, backgroundColor: C.track, padding: 3 },
  switchTrackOn: { backgroundColor: C.accent },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.card },
  switchKnobOn: { alignSelf: 'flex-end' },

  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink, width: 84 },
  fieldSuffix: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub },
  numberField: { width: 72, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 12, fontFamily: F.bodyMed, fontSize: 15, color: C.ink, textAlign: 'center' },
});
