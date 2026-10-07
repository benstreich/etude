import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';

import { PlayIcon } from '@/components/icons';
import { MetNote, RollingNumber } from '@/components/motifs';
import { Text } from '@/components/text';
import { Bump } from '@/components/motion';
import { ActionChip, EntryRow, Sheet, Stepper, Switch, UnderlineTabs } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { LOCK_SCREEN_STEP, preloadClicks, previewClick, useBeat, useMetronome } from '@/lib/metronome';
import { describeRamp, MAX_BPM, MIN_BPM, SOUND_SETS, SUBDIVS, tapTempo, type Level, type RampUnit, type SoundSet } from '@/lib/metronome-math';
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
// what a screen reader says for each dot: 0 muted, 1 plain, 2 group start, 3 downbeat
const LEVEL_KEY: Record<Level, string> = {
  0: 'metronome.levelMuted',
  1: 'metronome.levelPlain',
  2: 'metronome.levelMid',
  3: 'metronome.levelAccent',
};

/** Opens the metronome sheet; shows the live tempo once it is running. */
export function MetronomeButton({ compact = false, presetBpm }: { compact?: boolean; presetBpm?: number }) {
  const s = useS();
  const C = useC();
  const { t } = useStore();
  const { fs } = useTheme();
  const { running, bpm, setBpm } = useMetronome();
  const [open, setOpen] = useState(false);
  const openSheet = () => {
    if (presetBpm && !running) setBpm(presetBpm);
    setOpen(true);
  };
  return (
    <>
      <Pressable
        style={[s.pill, compact && s.pillCompact, running && s.pillOn]}
        accessibilityRole="button"
        accessibilityLabel={running ? t('metronome.runningA11y', { bpm }) : t('metronome.metronome')}
        onPress={openSheet}>
        {running ? (
          // the note goes through SVG, never Text (see MetNote)
          <View style={s.pillRow}>
            <MetNote size={fs(16)} color={C.bg} />
            <Text style={[s.pillText, { color: C.bg }]}>{bpm}</Text>
          </View>
        ) : (
          <Text style={s.pillText}>{t('metronome.metronome')}</Text>
        )}
      </Pressable>
      <MetronomeSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function MetronomeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const { t } = useStore();
  return (
    <Sheet visible={visible} onClose={onClose} grabber contentStyle={{ gap: 18 }}>
      <Text style={s.sheetTitle}>{t('metronome.metronome')}</Text>
      <MetronomeControls active={visible} />
    </Sheet>
  );
}

/**
 * Every metronome control, no chrome: MetronomeSheet wraps it in the shared Sheet, the Tools
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
  const { beat, n: pulse } = useBeat();
  const taps = useRef<number[]>([]);
  // every sound set ready before the picker is touched (#78)
  useEffect(() => {
    if (active) preloadClicks();
  }, [active]);

  const onTapTempo = () => {
    tap();
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

  // 12/8 at the usual spacing ran wider than a 360dp phone
  const dense = accents.length > 9;

  return (
    <>
            {/* tap a dot to cycle its accent: accent → mid → plain → muted (#57) */}
            <View style={[s.dots, dense && { gap: 8 }]}>
              {accents.map((level, i) => (
                <Pressable
                  key={i}
                  hitSlop={dense ? 4 : 6}
                  accessibilityRole="button"
                  accessibilityLabel={t('metronome.beatA11y', { n: i + 1, level: t(LEVEL_KEY[level]) })}
                  accessibilityHint={t('metronome.accentsHint')}
                  onPress={() => cycleAccent(i)}>
                  {/* keyed on the pulse, not the index: in 1/4 the index never changes */}
                  <Bump trigger={running && beat === i ? pulse : 0} peak={level === 3 ? 1.5 : 1.3}>
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

            {/* its own target, not a link inside the Start row: a slightly missed tap there toggled playback */}
            <Pressable style={[s.pill, s.tapPill]} accessibilityRole="button" onPress={onTapTempo}>
              <Text style={s.pillText}>{t('metronome.tapTempo')}</Text>
            </Pressable>

            <EntryRow
              testID="metro-start"
              keySize={52}
              keyStyle={running ? { backgroundColor: C.accent } : { borderWidth: 1.5, borderColor: C.ink }}
              keyContent={running ? <View style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: C.bg }} /> : <PlayIcon color={C.ink} />}
              title={running ? t('metronome.stop') : t('metronome.start')}
              right={null}
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
              <VolumeSlider value={volume} onChange={setVolume} label={t('metronome.volume')} />
            </View>

            <View style={{ gap: 12 }}>
              {/* the row is the switch for a screen reader; the inner Switch is hidden from
                  it (still tappable) so TalkBack/VoiceOver announce one element, not two */}
              <Pressable
                style={s.switchRow}
                accessibilityRole="switch"
                accessibilityLabel={t('metronome.tempoRamp')}
                accessibilityState={{ checked: ramp.on }}
                onPress={() => {
                  tap();
                  setRamp({ on: !ramp.on });
                }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{t('metronome.tempoRamp')}</Text>
                  <Text style={s.hint}>{summary ?? t(ramp.on ? 'metronome.rampSameTarget' : 'metronome.rampOffHint')}</Text>
                </View>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Switch value={ramp.on} onChange={(on) => setRamp({ on })} />
                </View>
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
                    {/* one unit: the two chips wrap together, never one per line */}
                    <View style={s.unitRow}>
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
                  </View>
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>{t('metronome.until')}</Text>
                    <Stepper value={ramp.target} min={MIN_BPM} max={MAX_BPM} coarseStep={5} size={38} suffix="BPM" onChange={(target) => setRamp({ target })} />
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
function VolumeSlider({ value, onChange, label }: { value: number; onChange: (pct: number) => void; label: string }) {
  const s = useS();
  const width = useRef(1);
  // onChange writes the whole store (and re-renders every consumer); per move event
  // that stuttered on a large library. The bar follows the finger from local state,
  // the click's volume is committed a few times a second and once more on release.
  const [drag, setDrag] = useState<number | null>(null);
  const lastCommit = useRef(0);
  const shown = drag ?? value;
  const at = (x: number, final = false) => {
    const pct = Math.round((Math.min(width.current, Math.max(0, x)) / width.current) * 100);
    setDrag(final ? null : pct);
    if (final || Date.now() - lastCommit.current > 150) {
      lastCommit.current = Date.now();
      onChange(pct);
    }
  };
  return (
    // a 44pt touch zone around the 12pt bar; it keeps the drag once it has it, or a
    // slightly diagonal one was handed to the scroll view. The bar inside is inert,
    // so locationX is always measured against this view.
    <View
      style={s.volHit}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: shown, text: `${shown}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.min(100, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 10 : -10))))}
      onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        at(e.nativeEvent.locationX);
        // true blocks the native responder: on Android the scroll view otherwise
        // intercepts past touch slop, whatever onResponderTerminationRequest says
        return true;
      }}
      onResponderMove={(e) => at(e.nativeEvent.locationX)}
      onResponderRelease={(e) => at(e.nativeEvent.locationX, true)}
      onResponderTerminate={(e) => at(e.nativeEvent.locationX, true)}>
      <View style={[s.volTrack, { pointerEvents: 'none' }]}>
        <View style={[s.volFill, { width: `${shown}%` }]} />
      </View>
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
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tapPill: { alignSelf: 'center' },

  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },

  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.chartInactive },
  dotDown: { backgroundColor: C.accent },
  dotMid: { backgroundColor: C.faint },
  dotMuted: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.chartInactive },
  // ink when lit: with reduce motion there is no bump, and a lit downbeat or mid
  // dot in its own colour showed no change at all
  dotLit: { backgroundColor: C.ink },
  dotDownLit: { backgroundColor: C.ink },
  dotMutedLit: { borderColor: C.faint },

  volHit: { height: 44, marginVertical: -16, justifyContent: 'center' },
  volTrack: { height: 12, borderRadius: r(999), backgroundColor: C.track, overflow: 'hidden', justifyContent: 'center' },
  volFill: { height: 12, borderRadius: r(999), backgroundColor: C.accent },

  bpmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bpmBox: { alignItems: 'center', minWidth: 132 },
  bpm: { fontFamily: F.head, fontSize: fs(72), color: C.ink, fontVariant: ['tabular-nums'], lineHeight: fs(72), letterSpacing: -2 },
  bpmUnit: { marginTop: 4, fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  bpmTerm: { fontFamily: F.accent, fontSize: fs(19), color: C.accent, marginTop: 2 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },

  label: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.6, textTransform: 'uppercase', color: C.tertiary },
  hint: { fontFamily: F.body, fontSize: fs(14.5), color: C.subStrong, lineHeight: fs(19) },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  fieldLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink, minWidth: 84 },
  unitRow: { flexDirection: 'row', gap: 10 },
}));
