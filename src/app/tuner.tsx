// Chromatic tuner. The mic tap is modules/pitch-input, the maths is
// lib/tuner-math; this file only polls, animates and renders.
//
// Everything that changes at 25 Hz — needle angle, arc colour, halo — is a
// Reanimated shared value driven from the poll tick, so the React tree
// re-renders only when the *note* changes, not on every frame of audio.
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Text } from '@/components/text';
import { Card } from '@/components/ui';
import { useStore } from '@/lib/store';
import { inputSampleRate, readSamples, startInput, stopInput, type TunerStatus } from '@/lib/tuner-input';
import {
  detectPitch,
  INSTRUMENTS,
  MAX_REF_A,
  midiToHz,
  MIN_REF_A,
  nearestString,
  smooth,
  toNote,
} from '@/lib/tuner-math';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** How often we pull a window off the mic. 40ms ≈ 25 readings a second — far
 *  faster than anyone can turn a peg, and cheap enough to leave headroom. */
const POLL_MS = 40;
/** Cents inside which the note counts as in tune. 5 is the usual tuner tolerance. */
const LOCK_CENTS = 5;
/** Readings kept for the median. 5 × 40ms = 200ms of history: enough to reject
 *  an octave error, short enough that the needle still feels live. */
const HISTORY = 5;
/** Ticks of silence before the display gives up and resets. */
const IDLE_TICKS = 12;

// Gauge geometry. A wide, shallow arc — a full semicircle would put ±50 cents
// at the horizon, where a couple of cents is invisible.
const GAUGE_W = 300;
const GAUGE_H = 150;
const CX = GAUGE_W / 2;
const CY = 138;
const RADIUS = 118;
const SWEEP = 62; // degrees either side of vertical

// All three are worklets: the needle and arc are rebuilt on the UI thread every
// frame, so these must be callable from inside useAnimatedProps.
const rad = (deg: number) => {
  'worklet';
  return (deg * Math.PI) / 180;
};

const pointAt = (deg: number, r: number) => {
  'worklet';
  return { x: CX + r * Math.sin(rad(deg)), y: CY - r * Math.cos(rad(deg)) };
};

const arcPath = (fromDeg: number, toDeg: number, r: number) => {
  'worklet';
  const a = pointAt(fromDeg, r);
  const b = pointAt(toDeg, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 ${toDeg > fromDeg ? 1 : 0} ${b.x} ${b.y}`;
};

export default function Tuner() {
  const s = useS();
  const C = useC();
  const { reduceMotion } = useTheme();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<TunerStatus | 'starting'>('starting');
  // Only the note identity lives in React state — cents drive shared values.
  const [note, setNote] = useState<{ name: string; octave: number; midi: number } | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  const instrument = INSTRUMENTS.find((i) => i.id === store.tunerInstrument) ?? INSTRUMENTS[0];
  const refA = store.tunerRefA;

  // -50..50, the single source of truth for the animation
  const cents = useSharedValue(0);
  // 0 = no signal, 1 = a note is being heard
  const live = useSharedValue(0);
  // 0 = out, 1 = locked
  const lock = useSharedValue(0);
  // 0 = half a semitone out, 1 = dead on. Drives the colour ramp.
  const prox = useSharedValue(0);

  const history = useRef<number[]>([]);
  const idle = useRef(0);
  const wasLocked = useRef(false);

  const settle = useCallback(
    (sv: typeof cents, to: number) => {
      'worklet';
      // A spring, not a timing curve: the slight overshoot and settle is what
      // makes the needle read as a physical instrument rather than a slider.
      sv.value = reduceMotion ? to : withSpring(to, { damping: 14, stiffness: 110, mass: 0.6 });
    },
    [reduceMotion],
  );

  const fade = useCallback(
    (sv: typeof live, to: number) => {
      'worklet';
      sv.value = reduceMotion ? to : withTiming(to, { duration: 180 });
    },
    [reduceMotion],
  );

  const reset = useCallback(() => {
    history.current = [];
    wasLocked.current = false;
    setNote(null);
    setTarget(null);
    settle(cents, 0);
    fade(live, 0);
    fade(lock, 0);
    fade(prox, 0);
  }, [cents, live, lock, prox, settle, fade]);

  const tick = useCallback(() => {
    const samples = readSamples();
    if (!samples) return;

    const pitch = detectPitch(samples, inputSampleRate());
    if (!pitch) {
      if (++idle.current >= IDLE_TICKS) reset();
      return;
    }
    idle.current = 0;

    history.current = [...history.current, pitch.hz].slice(-HISTORY);
    const hz = smooth(history.current);
    const n = toNote(hz, refA);

    // With a string pinned, measure against that string rather than the nearest
    // note — that is the whole point of pinning while a string is far out.
    const pinnedMidi = pinned === null ? null : instrument.strings[pinned];
    const off =
      pinnedMidi === null
        ? n.cents
        : Math.max(-50, Math.min(50, 1200 * Math.log2(hz / midiToHz(pinnedMidi, refA))));

    settle(cents, off);
    fade(live, 1);
    fade(prox, 1 - Math.abs(off) / 50);

    const locked = Math.abs(off) <= LOCK_CENTS;
    fade(lock, locked ? 1 : 0);
    // Exactly once, on the way in. Never on the way out — otherwise it buzzes
    // continuously while a peg is being turned.
    if (locked && !wasLocked.current) Haptics.selectionAsync().catch(() => {});
    wasLocked.current = locked;

    setNote((prev) =>
      prev?.midi === n.midi ? prev : { name: n.name, octave: n.octave, midi: n.midi },
    );
    setTarget(pinned ?? nearestString(n.midi, instrument.strings));
  }, [cents, live, lock, prox, settle, fade, reset, refA, pinned, instrument]);

  const begin = useCallback(async () => {
    setStatus('starting');
    const result = await startInput();
    setStatus(result);
    return result;
  }, []);

  // Mic on focus, off on blur. A tuner that holds the microphone open in the
  // background is how an app earns one-star reviews.
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      let cancelled = false;
      begin().then((result) => {
        if (cancelled || result !== 'ok') return;
        timer = setInterval(tick, POLL_MS);
      });
      return () => {
        cancelled = true;
        if (timer) clearInterval(timer);
        stopInput();
        reset();
      };
    }, [begin, tick, reset]),
  );

  // --- animated bits ---

  const needleProps = useAnimatedProps(() => {
    const deg = (cents.value / 50) * SWEEP;
    const tip = pointAt(deg, RADIUS - 12);
    const tail = pointAt(deg, 26);
    return { x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y, opacity: 0.35 + live.value * 0.65 };
  });

  // The active arc runs from dead centre out to wherever the needle is, so the
  // band of colour shrinks as the note comes in — the shape says "closer", and
  // the colour says "close enough". Both, because colour alone is not a signal.
  const arcProps = useAnimatedProps(() => {
    const deg = (cents.value / 50) * SWEEP;
    return {
      d: arcPath(0, Math.abs(deg) < 0.4 ? (deg < 0 ? -0.4 : 0.4) : deg, RADIUS),
      stroke: interpolateColor(prox.value, [0, 0.7, 0.9], [C.tertiary, C.accent, C.success]),
      opacity: 0.3 + live.value * 0.7,
    };
  });

  const hubProps = useAnimatedProps(() => ({
    fill: interpolateColor(prox.value, [0, 0.7, 0.9], [C.tertiary, C.accent, C.success]),
  }));

  const noteStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lock.value * 0.04 }],
    opacity: 0.3 + live.value * 0.7,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: lock.value,
    transform: [{ scale: 0.85 + lock.value * 0.15 }],
  }));

  // --- status cards: every failure gets a way forward, never a dead gauge ---

  if (status !== 'ok') {
    const card =
      status === 'starting'
        ? null
        : status === 'no-module'
          ? { title: store.t('tuner.needsDevBuild'), body: store.t('tuner.needsDevBuildBody'), action: null }
          : status === 'denied'
            ? {
                title: store.t('tuner.denied'),
                body: store.t('tuner.deniedBody'),
                action: { label: store.t('tuner.openSettings'), run: () => Linking.openSettings() },
              }
            : {
                title: store.t('tuner.error'),
                body: store.t('tuner.errorBody'),
                action: { label: store.t('tuner.retry'), run: begin },
              };

    return (
      <View style={[s.screen, { paddingTop: insets.top + 12 }]}>
        <Header onClose={() => router.back()} title={store.t('tuner.tuner')} />
        {card && (
          <Card style={s.statusCard}>
            <Text style={s.statusTitle}>{card.title}</Text>
            <Text style={s.statusBody}>{card.body}</Text>
            {card.action && (
              <Pressable
                style={s.statusBtn}
                accessibilityRole="button"
                accessibilityLabel={card.action.label}
                onPress={card.action.run}>
                <Text style={s.statusBtnText}>{card.action.label}</Text>
              </Pressable>
            )}
          </Card>
        )}
      </View>
    );
  }

  const heard = note !== null;

  return (
    <View style={[s.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <Header onClose={() => router.back()} title={store.t('tuner.tuner')} />

      <View style={s.controls}>
        <Pressable
          style={s.control}
          accessibilityRole="button"
          accessibilityLabel={`${store.t('tuner.instrument')}: ${store.t(`tuner.${instrument.id}`)}`}
          onPress={() => {
            const next = INSTRUMENTS[(INSTRUMENTS.indexOf(instrument) + 1) % INSTRUMENTS.length];
            store.updateSettings({ tunerInstrument: next.id });
            setPinned(null);
          }}>
          <Text style={s.controlLabel}>{store.t('tuner.instrument')}</Text>
          <Text style={s.controlValue}>{store.t(`tuner.${instrument.id}`)}</Text>
        </Pressable>

        <View style={s.control}>
          <Text style={s.controlLabel}>{store.t('tuner.reference')}</Text>
          <View style={s.stepper}>
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`${store.t('tuner.reference')} −1`}
              disabled={refA <= MIN_REF_A}
              onPress={() => store.updateSettings({ tunerRefA: Math.max(MIN_REF_A, refA - 1) })}>
              <Text style={[s.stepBtn, refA <= MIN_REF_A && s.stepOff]}>−</Text>
            </Pressable>
            <Text style={s.controlValue}>{refA}</Text>
            <Pressable
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`${store.t('tuner.reference')} +1`}
              disabled={refA >= MAX_REF_A}
              onPress={() => store.updateSettings({ tunerRefA: Math.min(MAX_REF_A, refA + 1) })}>
              <Text style={[s.stepBtn, refA >= MAX_REF_A && s.stepOff]}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={s.gaugeWrap}>
        <Svg width={GAUGE_W} height={GAUGE_H}>
          {/* the track, and a centre tick marking dead-on */}
          <Path d={arcPath(-SWEEP, SWEEP, RADIUS)} stroke={C.track} strokeWidth={10} strokeLinecap="round" fill="none" />
          <AnimatedPath animatedProps={arcProps} strokeWidth={10} strokeLinecap="round" fill="none" />
          {[-50, -25, 0, 25, 50].map((c) => {
            const deg = (c / 50) * SWEEP;
            const a = pointAt(deg, RADIUS - 20);
            const b = pointAt(deg, RADIUS - (c === 0 ? 34 : 28));
            return (
              <Line
                key={c}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={c === 0 ? C.barline : C.staffLine}
                strokeWidth={c === 0 ? 2 : 1}
              />
            );
          })}
          <AnimatedLine animatedProps={needleProps} stroke={C.ink} strokeWidth={2.5} strokeLinecap="round" />
          <AnimatedCircle animatedProps={hubProps} cx={CX} cy={CY} r={7} />
        </Svg>
        <View style={s.gaugeEnds} pointerEvents="none">
          <Text style={s.gaugeEnd}>{store.t('tuner.flat')}</Text>
          <Text style={s.gaugeEnd}>{store.t('tuner.sharp')}</Text>
        </View>
      </View>

      <View style={s.readout}>
        <Animated.View style={[s.halo, haloStyle]} pointerEvents="none" />
        <Animated.View style={noteStyle}>
          <View style={s.noteRow}>
            <Text style={s.noteName} accessibilityLabel={heard ? `${note.name} ${note.octave}` : undefined}>
              {heard ? note.name.replace('#', '♯') : '—'}
            </Text>
            {heard && <Text style={s.noteOctave}>{note.octave}</Text>}
          </View>
        </Animated.View>
        <CentsLabel cents={cents} live={live} lock={lock} inTune={store.t('tuner.inTune')} idle={store.t('tuner.listening')} />
      </View>

      {instrument.strings.length > 0 && (
        <View style={s.strings}>
          {instrument.strings.map((midi, i) => {
            const on = target === i;
            const isPinned = pinned === i;
            const n = toNote(midiToHz(midi, refA), refA);
            return (
              <Pressable
                key={`${midi}-${i}`}
                style={s.stringCell}
                accessibilityRole="button"
                accessibilityState={{ selected: isPinned }}
                accessibilityLabel={`${n.name.replace('#', '♯')}${n.octave}`}
                onPress={() => setPinned(isPinned ? null : i)}>
                <View style={[s.stringDot, on && s.stringDotOn, isPinned && s.stringDotPinned]} />
                <Text style={[s.stringLabel, (on || isPinned) && s.stringLabelOn]}>
                  {n.name.replace('#', '♯')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!heard && <Text style={s.hint}>{store.t('tuner.listening')}</Text>}
    </View>
  );
}

/**
 * The cents readout. Split into its own component with its own animated style
 * so the number can update without re-rendering the gauge above it.
 */
function CentsLabel({
  cents,
  live,
  lock,
  inTune,
  idle,
}: {
  cents: { value: number };
  live: { value: number };
  lock: { value: number };
  inTune: string;
  idle: string;
}) {
  const s = useS();
  const [text, setText] = useState(idle);
  const [locked, setLocked] = useState(false);

  // Sampled at a quarter of the audio rate: the number only needs to be
  // readable, and re-rendering text 25×/sec is wasted work.
  React.useEffect(() => {
    const id = setInterval(() => {
      if (live.value < 0.5) {
        setText(idle);
        setLocked(false);
        return;
      }
      const c = Math.round(cents.value);
      setLocked(lock.value > 0.5);
      setText(lock.value > 0.5 ? inTune : `${c > 0 ? '+' : ''}${c} ¢`);
    }, 160);
    return () => clearInterval(id);
  }, [cents, live, lock, inTune, idle]);

  return <Text style={[s.cents, locked && s.centsLocked]}>{text}</Text>;
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  const s = useS();
  return (
    <View style={s.header}>
      <Text style={s.title}>{title}</Text>
      <Pressable hitSlop={16} accessibilityRole="button" accessibilityLabel={title} onPress={onClose}>
        <Text style={s.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
    title: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
    close: { fontFamily: F.body, fontSize: fs(20), color: C.sub, paddingHorizontal: 4 },

    controls: { flexDirection: 'row', gap: 12, marginTop: 8 },
    control: {
      flex: 1,
      minHeight: 56,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: r(12),
      borderWidth: 1,
      borderColor: C.cardBorder,
      backgroundColor: C.card,
    },
    controlLabel: { fontFamily: F.body, fontSize: fs(11), color: C.subStrong, letterSpacing: 0.4, textTransform: 'uppercase' },
    controlValue: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    stepBtn: { fontFamily: F.bodyMed, fontSize: fs(20), color: C.accent, width: 28, textAlign: 'center' },
    stepOff: { color: C.faint },

    gaugeWrap: { alignItems: 'center', marginTop: 24 },
    gaugeEnds: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    gaugeEnd: { fontFamily: F.body, fontSize: fs(12), color: C.tertiary },

    readout: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 150 },
    halo: {
      position: 'absolute',
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: C.successTint,
    },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start' },
    noteName: { fontFamily: F.accent, fontSize: fs(92), lineHeight: fs(104), color: C.ink },
    noteOctave: { fontFamily: F.body, fontSize: fs(22), lineHeight: fs(40), color: C.subStrong, marginLeft: 2 },
    cents: { fontFamily: F.bodyMed, fontSize: fs(17), color: C.subStrong, marginTop: 4 },
    centsLocked: { color: C.success, fontFamily: F.bodySemi },

    strings: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8 },
    stringCell: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 6 },
    stringDot: { width: 12, height: 12, borderRadius: r(6), backgroundColor: C.track },
    stringDotOn: { backgroundColor: C.accent },
    stringDotPinned: { backgroundColor: C.ink, width: 14, height: 14, borderRadius: r(7) },
    stringLabel: { fontFamily: F.body, fontSize: fs(13), color: C.tertiary },
    stringLabelOn: { color: C.ink, fontFamily: F.bodySemi },

    hint: { fontFamily: F.accent, fontSize: fs(15), color: C.sub, textAlign: 'center', marginTop: 12 },

    statusCard: { marginTop: 24, padding: 20, gap: 8 },
    statusTitle: { fontFamily: F.headBold, fontSize: fs(17), color: C.ink },
    statusBody: { fontFamily: F.body, fontSize: fs(14), lineHeight: fs(21), color: C.subStrong },
    statusBtn: {
      alignSelf: 'flex-start',
      marginTop: 8,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: r(999),
      backgroundColor: C.accent,
    },
    statusBtnText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.bg },
  }),
);
