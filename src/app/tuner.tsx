// Chromatic tuner. The mic tap is modules/pitch-input, the maths is
// lib/tuner-math; this file only polls, animates and renders.
//
// Everything that changes at 25 Hz — needle angle, arc colour, halo — is a
// Reanimated shared value driven from the poll tick, so the React tree
// re-renders only when the *note* changes, not on every frame of audio.
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
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
import { BackLink, Card, Stepper } from '@/components/ui';
import { useStore } from '@/lib/store';
import { inputSampleRate, micGranted, readSamples, startInput, stopInput, type TunerStatus } from '@/lib/tuner-input';
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
/** Cents past which a lock is released. Wider than LOCK_CENTS so a note held
 *  right at the edge doesn't buzz and flicker in and out. */
const UNLOCK_CENTS = 8;
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
  const [instOpen, setInstOpen] = useState(false); // the instrument picker row under the title
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

  // the halo and the note answer the lock as one event, on the same curve —
  // separate timings used to arrive at slightly different moments
  const settleLock = useCallback(
    (sv: typeof lock, to: number) => {
      'worklet';
      sv.value = reduceMotion ? to : withTiming(to, { duration: 250 });
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
    settleLock(lock, 0);
    fade(prox, 0);
  }, [cents, live, lock, prox, settle, fade, settleLock]);

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

    const locked = Math.abs(off) <= (wasLocked.current ? UNLOCK_CENTS : LOCK_CENTS);
    settleLock(lock, locked ? 1 : 0);
    // Exactly once, on the way in. Never on the way out — otherwise it buzzes
    // continuously while a peg is being turned.
    if (locked && !wasLocked.current) Haptics.selectionAsync().catch(() => {});
    wasLocked.current = locked;

    setNote((prev) =>
      prev?.midi === n.midi ? prev : { name: n.name, octave: n.octave, midi: n.midi },
    );
    setTarget(pinned ?? nearestString(n.midi, instrument.strings));
  }, [cents, live, lock, prox, settle, fade, settleLock, reset, refA, pinned, instrument]);

  // The interval calls through a ref, so pinning a string or nudging the
  // reference swaps the tick without restarting the mic and blanking the screen.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);
  // 'Try again' bumps this to rerun the whole focus effect — the interval is
  // only created there, so reopening the mic alone left a frozen needle.
  const [attempt, setAttempt] = useState(0);

  const begin = useCallback(async (isStale: () => boolean) => {
    setStatus('starting');
    const result = await startInput(isStale);
    if (!isStale()) setStatus(result);
    return result;
  }, []);

  // Mic on focus, off on blur — and off in the background. A tuner that holds
  // the microphone open in the background is how an app earns one-star reviews.
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      // bumped by every start and stop, so a start still waiting on the
      // permission prompt knows it has been overtaken
      let gen = 0;
      let last: TunerStatus | null = null;
      let resume = false;
      const start = () => {
        const mine = ++gen;
        const stale = () => mine !== gen;
        begin(stale).then((result) => {
          if (stale()) return; // blurred (or restarted) meanwhile — the cleanup's stop() already ran
          last = result;
          if (result !== 'ok') return;
          // backgrounded while the start was in flight with permission already
          // granted: the background handler saw no running mic and left it, so the
          // mic just opened behind the user's back — close it, reopen on return
          if (AppState.currentState !== 'active') {
            stop();
            resume = true;
            return;
          }
          timer = setInterval(() => tickRef.current(), POLL_MS);
        });
      };
      const stop = () => {
        gen++;
        if (timer) clearInterval(timer);
        timer = null;
        stopInput();
        reset();
      };
      start();
      const sub = AppState.addEventListener('change', (state) => {
        // only a running mic is stopped: Android backgrounds the app for its
        // own permission dialog, and that must not restart the prompt
        if (state === 'background' && timer) {
          stop();
          resume = true;
        } else if (state === 'active') {
          if (resume) {
            resume = false;
            start();
          } else if (last === 'denied') {
            // back from Settings, where access may just have been granted
            const g = gen;
            micGranted().then((ok) => {
              if (ok && g === gen) start();
            });
          }
        }
      });
      return () => {
        sub.remove();
        stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- attempt is the retry trigger, read by nothing inside
    }, [begin, reset, attempt]),
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
                action: { label: store.t('tuner.retry'), run: () => setAttempt((n) => n + 1) },
              };

    return (
      // scrolls: in German at the largest text size the card's action button
      // would otherwise fall off the bottom
      <ScrollView style={s.scroll} contentContainerStyle={[s.screen, { paddingTop: insets.top + 24 }]}>
        <BackLink label={store.t('tabs.tools')} onPress={() => router.back()} />
        <Text style={s.title}>{store.t('tuner.tuner')}</Text>
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
      </ScrollView>
    );
  }

  const heard = note !== null;
  // TalkBack reads a bare '#' as "hash"
  const spoken = (name: string) => (name.includes('#') ? store.t('common.noteSharp', { note: name[0] }) : name);

  return (
    // Scrolls rather than clips: at the largest Dynamic Type setting the note
    // glyph alone is over 110pt, and the tab bar already owns the bottom inset.
    <ScrollView style={s.scroll} contentContainerStyle={[s.screen, { paddingTop: insets.top + 24 }]}>
      <BackLink label={store.t('tabs.tools')} onPress={() => router.back()} />

      <View style={s.titleRow}>
        <Text style={s.title}>{store.t('tuner.tuner')}</Text>
        <View style={s.controls}>
          <Pressable
            testID="tuner-instruments"
            accessibilityRole="button"
            accessibilityState={{ expanded: instOpen }}
            accessibilityLabel={`${store.t('tuner.instrument')}: ${store.t(`tuner.${instrument.id}`)}`}
            onPress={() => setInstOpen((v) => !v)}>
            <Text style={s.controlValue}>
              {store.t(`tuner.${instrument.id}`)} <Text style={s.controlChevron}>▾</Text>
            </Text>
          </Pressable>
          <Text style={s.controlSep}>|</Text>
          <Text style={s.controlLabel}>{store.t('tuner.reference')}</Text>
          <Stepper
            value={refA}
            min={MIN_REF_A}
            max={MAX_REF_A}
            size={30}
            suffix="Hz"
            label={store.t('tuner.reference')}
            onChange={(v) => store.updateSettings({ tunerRefA: v })}
          />
        </View>
      </View>
      {/* a real picker, not a cycle-on-tap: every instrument visible, one tap to choose */}
      {instOpen && (
        <View style={s.instRow}>
          {INSTRUMENTS.map((i) => {
            const sel = i.id === instrument.id;
            return (
              <Pressable
                key={i.id}
                testID={`tuner-inst-${i.id}`}
                style={[s.instChip, sel && s.instChipSel]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                onPress={() => {
                  store.updateSettings({ tunerInstrument: i.id });
                  setPinned(null);
                  setInstOpen(false);
                }}>
                <Text style={[s.instChipText, sel && { color: C.accent }]}>{store.t(`tuner.${i.id}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

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
        {heard && (
          <Animated.View style={noteStyle}>
            {/* one element: labelling the name alone left the octave to be read a second time */}
            <View style={s.noteRow} accessible accessibilityLabel={`${spoken(note.name)} ${note.octave}`}>
              <Text style={s.noteName}>{note.name.replace('#', '♯')}</Text>
              <Text style={s.noteOctave}>{note.octave}</Text>
            </View>
          </Animated.View>
        )}
        <CentsLabel cents={cents} live={live} lock={lock} inTune={store.t('tuner.inTune')} idle={store.t('tuner.listening')} />
      </View>

      {instrument.strings.length > 0 && (
        <View style={s.stringsWrap}>
          <View style={s.stringsRule} />
          <View style={s.stringsEndBars}>
            <View style={{ width: 1.5, height: 15, backgroundColor: C.barline }} />
            <View style={{ width: 3, height: 15, backgroundColor: C.sub, marginLeft: 4 }} />
          </View>
          <View style={s.strings}>
            {instrument.strings.map((midi, i) => {
              const on = target === i;
              const isPinned = pinned === i;
              const n = toNote(midiToHz(midi, refA), refA);
              return (
                <StringCell
                  key={`${midi}-${i}`}
                  on={on || isPinned}
                  label={n.name.replace('#', '♯')}
                  spoken={spoken(n.name)}
                  octave={n.octave}
                  onPress={() => setPinned(isPinned ? null : i)}
                />
              );
            })}
          </View>
          <Text style={s.stringHint}>{store.t('tuner.stringHint')}</Text>
        </View>
      )}

    </ScrollView>
  );
}

/** A string in the row below the gauge. Its dot grows rather than swaps on selection, and the label crossfades along with it. */
function StringCell({
  on,
  label,
  spoken,
  octave,
  onPress,
}: {
  on: boolean;
  label: string;
  spoken: string;
  octave: number;
  onPress: () => void;
}) {
  const s = useS();
  const C = useC();
  const { reduceMotion } = useTheme();
  const t = useSharedValue(on ? 1 : 0);
  React.useEffect(() => {
    t.value = reduceMotion ? (on ? 1 : 0) : withSpring(on ? 1 : 0, { damping: 14, stiffness: 260 });
  }, [on, reduceMotion, t]);
  const dotStyle = useAnimatedStyle(() => ({
    width: 9 + t.value * 5,
    height: 9 + t.value * 5,
    borderRadius: (9 + t.value * 5) / 2,
    borderColor: interpolateColor(t.value, [0, 1], [C.barline, C.accent]),
    backgroundColor: interpolateColor(t.value, [0, 1], ['transparent', C.accent]),
  }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(t.value, [0, 1], [C.tertiary, C.ink]) }));
  return (
    <Pressable
      style={s.stringCell}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${spoken} ${octave}`}
      onPress={onPress}>
      <Animated.View style={[s.stringDot, dotStyle]} />
      <Animated.Text style={[s.stringLabel, labelStyle]}>{label}</Animated.Text>
    </Pressable>
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
  // 'idle' | 'off' | 'locked' — drives which of the three type styles applies
  const [mode, setMode] = useState<'idle' | 'off' | 'locked'>('idle');
  // Screen readers hear only the transitions into 'locked' and 'idle' — the
  // running cents value would be a constant stream of speech.
  const lastMode = useRef<'idle' | 'off' | 'locked'>('idle');

  // Sampled at a quarter of the audio rate: the number only needs to be
  // readable, and re-rendering text 25×/sec is wasted work.
  React.useEffect(() => {
    const announce = (next: 'idle' | 'off' | 'locked', msg: string) => {
      if (next !== 'off' && next !== lastMode.current) AccessibilityInfo.announceForAccessibility(msg);
      lastMode.current = next;
    };
    const id = setInterval(() => {
      if (live.value < 0.5) {
        setText(idle);
        setMode('idle');
        announce('idle', idle);
        return;
      }
      const locked = lock.value > 0.5;
      const c = Math.round(cents.value);
      setMode(locked ? 'locked' : 'off');
      announce(locked ? 'locked' : 'off', inTune);
      setText(locked ? inTune : `${c > 0 ? '+' : ''}${c} ¢`);
    }, 160);
    return () => clearInterval(id);
  }, [cents, live, lock, inTune, idle]);

  return (
    <Text style={[s.cents, mode === 'idle' && s.centsIdle, mode === 'locked' && s.centsLocked]}>
      {text}
    </Text>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.bg },
    screen: { paddingHorizontal: 24, paddingBottom: 24 },

    title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },

    // wraps rather than overflows: the title and the controls together run wider
    // than a phone at the default text size, and wider still under Dynamic Type,
    // so on a narrow screen the controls drop to their own line instead of
    // pushing the reference stepper off the right edge
    titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6, flexShrink: 1, flexWrap: 'wrap', rowGap: 4 },
    instRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    // the transparent border reserves the width, so selecting doesn't shift the chip
    instChip: { height: 34, paddingHorizontal: 14, borderRadius: r(999), borderWidth: 1.5, borderColor: 'transparent', backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
    instChipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
    instChipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
    controlLabel: { fontFamily: F.body, fontSize: fs(14), color: C.subStrong },
    controlValue: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
    controlChevron: { color: C.tertiary },
    controlSep: { color: C.staffLine, fontSize: fs(14) },

    gaugeWrap: { alignItems: 'center', marginTop: 24 },
    // pinned to the gauge's own width, not the screen's, so the labels stay
    // attached to the ends of the arc they describe
    gaugeEnds: {
      position: 'absolute',
      bottom: 0,
      width: GAUGE_W,
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
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
    noteName: { fontFamily: F.body, fontSize: fs(92), lineHeight: fs(104), color: C.ink },
    noteOctave: { fontFamily: F.body, fontSize: fs(22), lineHeight: fs(40), color: C.subStrong, marginLeft: 2 },
    cents: { fontFamily: F.bodyMed, fontSize: fs(17), color: C.subStrong, marginTop: 4 },
    // with no note to show, this line is the whole readout — give it the
    // musical voice rather than leaving a bare data label floating
    centsIdle: { fontFamily: F.body, fontSize: fs(19), color: C.sub },
    centsLocked: { color: C.success, fontFamily: F.bodySemi },

    stringsWrap: { position: 'relative', marginTop: 8, paddingTop: 16 },
    stringsRule: { position: 'absolute', left: 0, right: 0, top: 28, height: 1, backgroundColor: C.staffLine },
    stringsEndBars: { position: 'absolute', right: 0, top: 21, flexDirection: 'row', alignItems: 'flex-end' },
    strings: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8 },
    stringCell: { minWidth: 44, minHeight: 48, alignItems: 'center', gap: 8 },
    stringDot: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: C.barline, backgroundColor: 'transparent' },
    stringLabel: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.tertiary },
    stringHint: { marginTop: 14, fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary },

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
