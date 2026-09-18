// Musical motifs from the soul pass: progress drawn as notation instead of as
// a ring or a pill row. Both draw in on mount and then sit still — the whole
// motion budget for these screens.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { Pressable } from '@/components/press';
import { Text } from '@/components/text';
import { accidentalFor, valueFor, type MelodyKey, type MelodyNote } from '@/lib/melody';
import { barlines, tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const STAFF_W = 284;
const STAFF_H = 33;
const GAP = 8; // five 1px rules, 8px apart

// Same fermata arc as the logomark (icons.tsx LogoMark), scaled up as the Home "Today" mark.
// pathLength isn't honoured on native react-native-svg, so the dash math uses
// the curve's real length (two cubic beziers, measured by sampling — see
// scripts/check-* pattern; this one's short enough to just hardcode).
export const FERMATA_D = 'M6 26c0-9.5 6.3-17 14-17s14 7.5 14 17';
const FERMATA_LEN = 48.84;
const AnimatedFermataPath = Animated.createAnimatedComponent(Path);

/**
 * Home's daily-goal indicator: the fermata arc fills as today's minutes come
 * in, and the dot (the goal) turns from `logoDot` to `accent` on completion.
 */
export function FermataMark({ pct, goalMet, size = 220 }: { pct: number; goalMet: boolean; size?: number }) {
  const C = useC();
  const { reduceMotion } = useTheme();
  const clamped = Math.min(100, Math.max(0, pct));
  const [v] = useState(() => new Animated.Value(reduceMotion ? clamped : 0));
  useEffect(() => {
    if (reduceMotion) v.setValue(clamped);
    else Animated.timing(v, { toValue: clamped, duration: 700, useNativeDriver: false }).start();
  }, [clamped, reduceMotion, v]);
  const dashoffset = v.interpolate({ inputRange: [0, 100], outputRange: [FERMATA_LEN, 0] });
  return (
    <Svg width={size} height={(size / 220) * 176} viewBox="2 5 36 28.8" style={{ overflow: 'visible' }}>
      <Path d={FERMATA_D} fill="none" stroke={C.accent} strokeOpacity={0.22} strokeWidth={3.4} strokeLinecap="round" />
      <AnimatedFermataPath
        d={FERMATA_D}
        fill="none"
        stroke={C.accent}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeDasharray={[FERMATA_LEN, FERMATA_LEN]}
        strokeDashoffset={dashoffset}
      />
      <Circle cx={20} cy={27} r={3.4} fill={goalMet ? C.accent : C.logoDot} />
    </Svg>
  );
}

// Staff geometry. Rules at STAFF_TOP + 0/20/40/60/80 (a space is 20px, a step
// 10px); the top margin leaves room for a fermata over the highest note.
const STAFF_TOP = 42;
const RULES = [0, 1, 2, 3, 4].map((i) => STAFF_TOP + i * 20);
const MELODY_H = RULES[4] + 24; // rules plus the day letters beneath
const NOTE_W = 34; // one note's column
const BAR_W = 10; // barline plus its breathing room
const B_LINE = RULES[2]; // pitch index 4 sits on the middle rule
// head centre on the middle rule needs the glyph box 36px above it (tuned on device:
// 18 at a 54 rule); every glyph shares a baseline so one offset places them all
const HEAD_TO_TOP = 36;
const headY = (pitch: number) => B_LINE - (pitch - 4) * 10;

/**
 * The practice log as a melody: one bar per day, one note per focus practiced
 * that day, its pitch owned by the piece or technique (lib/melody.ts) and its
 * value the minutes against the daily goal — a whole note is the goal met, a
 * fermata over it means beaten. A day off is a rest. Today is the rightmost bar,
 * and the staff opens scrolled to it.
 */
export function MelodyStaff({
  bars,
  goal,
  melodyKey,
  selected,
  sounding,
  onSelect,
}: {
  /** oldest first, today last */
  bars: { date: string; day: string; isToday: boolean; notes: MelodyNote[] }[];
  /** daily goal in minutes; the note values are read against it */
  goal: number;
  /** the key the staff is read in; altered notes get their accidental written in front */
  melodyKey: MelodyKey;
  /** dateKey of the day being read below the staff; its notes and letter go accent */
  selected?: string;
  /** dateKey of the bar playing right now (lib/melody-play.ts); lit like the selection */
  sounding?: string;
  onSelect?: (date: string) => void;
}) {
  const C = useC();
  const scroll = useRef<ScrollView>(null);
  const width = bars.reduce((w, b) => w + BAR_W + Math.max(1, b.notes.length) * NOTE_W, 0) + 20;
  const jumped = useRef(false);
  // a plain render function, not a nested component: a component defined inside
  // render is a new type every time and would remount all 84 bars per re-render
  const renderBar = (b: (typeof bars)[number]) => {
    const on = b.date === selected || b.date === sounding;
    const ink = on || b.isToday ? C.accent : C.ink;
    return (
      <Pressable key={b.date} style={{ flexDirection: 'row' }} disabled={!onSelect} onPress={() => onSelect?.(b.date)}>
        <View style={{ width: BAR_W, paddingLeft: 4, marginTop: STAFF_TOP }}>
          <View style={{ width: 1.5, height: 81, backgroundColor: C.barline }} />
        </View>
        <View style={{ alignItems: 'center', height: MELODY_H }}>
          <View style={{ flexDirection: 'row', height: MELODY_H }}>
            {b.notes.length === 0 ? (
              <Text style={{ width: NOTE_W, textAlign: 'center', marginTop: RULES[1], fontFamily: F.notation, fontSize: 44, lineHeight: 44, color: on ? C.accent : C.sub }}>{'\u{1D13D}'}</Text>
            ) : (
              b.notes.map((n) => {
                const v = valueFor(n.min, goal);
                const y = headY(n.pitch);
                const acc = accidentalFor(n.pitch, melodyKey);
                return (
                  <View key={n.title} style={{ width: NOTE_W, height: MELODY_H }}>
                    {!!acc && <Text style={{ position: 'absolute', left: 0, top: y - 11, fontFamily: F.notation, fontSize: 18, lineHeight: 22, color: ink }}>{acc}</Text>}
                    {n.min > goal && (
                      <Text style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', top: y - 42, fontFamily: F.notation, fontSize: 22, lineHeight: 22, color: ink }}>{'\u{1D110}'}</Text>
                    )}
                    <Text style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', top: y - HEAD_TO_TOP, fontFamily: F.notation, fontSize: 44, lineHeight: 44, color: ink }}>{v.glyph}</Text>
                    {v.dotted && <View style={{ position: 'absolute', left: NOTE_W / 2 + 9, top: y - 7, width: 4, height: 4, borderRadius: 2, backgroundColor: ink }} />}
                  </View>
                );
              })
            )}
          </View>
          <Text style={{ position: 'absolute', bottom: 0, fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 0.5, color: on || b.isToday ? C.accent : C.tertiary }}>{b.day}</Text>
          {on && <View style={{ position: 'absolute', bottom: -6, width: 16, height: 1.5, backgroundColor: C.accent }} />}
        </View>
      </Pressable>
    );
  };
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      // opens on today; measured content is the only reliable moment to jump there. Once:
      // a note logged into a past day widens the content and must not yank the view back
      onContentSizeChange={() => {
        if (jumped.current) return;
        jumped.current = true;
        scroll.current?.scrollToEnd({ animated: false });
      }}
      style={{ height: MELODY_H + 6 }}
      contentContainerStyle={{ width, height: MELODY_H }}>
      {RULES.map((top) => (
        <View key={top} style={{ position: 'absolute', left: 0, right: 0, top, height: 1, backgroundColor: C.staffLine }} />
      ))}
      <View style={{ position: 'absolute', flexDirection: 'row', left: 0, right: 0, top: 0, bottom: 0 }}>
        {bars.map(renderBar)}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 3, marginTop: STAFF_TOP }}>
          <View style={{ width: 1.5, height: 81, backgroundColor: C.barline }} />
          <View style={{ width: 3, height: 81, backgroundColor: C.sub }} />
        </View>
      </View>
    </ScrollView>
  );
}

/** Width animated 0→pct on mount; instant when reduce-motion is on. */
function useDraw(duration: number) {
  const { reduceMotion } = useTheme();
  const [v] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (!reduceMotion) Animated.timing(v, { toValue: 1, duration, useNativeDriver: false }).start();
  }, [reduceMotion, duration, v]);
  return v;
}

/**
 * Session review — five staff rules with the progress line drawn along the
 * middle one, ending in a quarter note. `pct` may exceed 100 (goal beaten);
 * the line clamps at the staff's width.
 */
export function StaffProgress({ pct }: { pct: number }) {
  const C = useC();
  const draw = useDraw(1100);
  const w = (Math.min(100, Math.max(0, pct)) / 100) * STAFF_W;
  return (
    <View style={{ width: STAFF_W, height: STAFF_H }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * GAP, height: 1, backgroundColor: C.staffLine }} />
      ))}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 2 * GAP - 1, // centred on the middle rule
          height: 3,
          borderRadius: 2,
          backgroundColor: C.accent,
          width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
        }}>
        <Svg width={15} height={24} viewBox="0 0 15 24" style={{ position: 'absolute', right: -7, top: -19 }}>
          <Ellipse cx={6} cy={19} rx={5.6} ry={4} transform="rotate(-20 6 19)" fill={C.accent} />
          <Rect x={10.6} y={2} width={1.6} height={17.5} rx={0.8} fill={C.accent} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Plan runner — the run drawn as a measure: a baseline with a barline at each
 * segment boundary and a double barline at the end. `done` is the fraction of
 * the whole plan completed.
 */
export function MeasureBar({ segments, done, color }: { segments: number[]; done: number; color?: string }) {
  const C = useC();
  const draw = useDraw(900);
  const bars = barlines(segments);
  const fill = color ?? C.accent;
  return (
    <View style={{ height: 16, marginTop: 6 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 7.5, height: 1, backgroundColor: C.staffLine }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 6.5,
          height: 3,
          borderRadius: 2,
          backgroundColor: fill,
          width: draw.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.min(100, Math.max(0, done * 100))}%`] }),
        }}
      />
      {bars.map((f, i) => (
        <View key={i} style={{ position: 'absolute', left: `${f * 100}%`, top: 1, width: 1.5, height: 14, backgroundColor: C.barline }} />
      ))}
      <View style={{ position: 'absolute', right: 4, top: 1, width: 1.5, height: 14, backgroundColor: C.barline }} />
      <View style={{ position: 'absolute', right: 0, top: 1, width: 3, height: 14, backgroundColor: C.sub }} />
    </View>
  );
}

/** "♩ 96 Moderato" — note glyph, BPM and term in one inline run; accent while a metronome is actually running. */
export function NoteTempo({ bpm, active, size = 14 }: { bpm: number; active?: boolean; size?: number }) {
  const C = useC();
  const { fs } = useTheme();
  const color = active ? C.accent : C.subStrong;
  return (
    <Text>
      <Text style={{ fontFamily: F.notation, fontSize: fs(size + 2), color }}>{'\u{1D15F} '}</Text>
      <Text style={{ fontFamily: F.bodySemi, fontSize: fs(size), color: active ? C.accent : C.ink }}>{bpm} </Text>
      {/* the italic serif is the accent voice only — plain sans when this isn't running */}
      <Text style={{ fontFamily: active ? F.accent : F.body, fontSize: fs(size), color }}>{tempoTerm(bpm)}</Text>
    </Text>
  );
}

/** "Andante · 84 BPM" — term in the accent serif, the rest in the caller's style. */
export function Tempo({ bpm, size = 13 }: { bpm: number; size?: number }) {
  const s = useS();
  const { fs } = useTheme();
  return (
    <Text style={[s.tempoRow, { fontSize: fs(size) }]}>
      <Text style={[s.term, { fontSize: fs(size + 1) }]}>{tempoTerm(bpm)}</Text>
      {` · ${bpm} BPM`}
    </Text>
  );
}

/**
 * The metronome chip's dot, pulsing one beat per 60/bpm seconds. `on` false
 * leaves it static — the chip also shows a tempo the metronome isn't playing.
 */
export function TickDot({ bpm, on, color }: { bpm: number; on: boolean; color: string }) {
  const { reduceMotion } = useTheme();
  const [v] = useState(() => new Animated.Value(0));
  const period = Math.max(120, (60 / Math.max(1, bpm)) * 1000);
  useEffect(() => {
    v.setValue(0);
    if (!on || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period / 2, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: period / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, period, reduceMotion, v]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
      }}
    />
  );
}

/** Quietest bar we draw — silence still reads as a line, not as nothing. */
export const LEVEL_FLOOR = 0.05;
const SAMPLE_MS = 90;
/** ~1.8s of an unmoving floor before we stop believing the mic level. */
const DEAD_AFTER = 20;

/**
 * The stand-in shape used when the device reports no level at all. Two primes
 * beaten against each other so it never visibly repeats, biased low so it reads
 * like playing rather than like a test pattern.
 */
const synthetic = (n: number) => {
  const a = Math.sin(n / 3.1);
  const b = Math.sin(n / 7.3);
  const c = Math.sin(n / 1.7);
  return Math.min(1, Math.max(LEVEL_FLOOR, 0.42 + 0.26 * a + 0.16 * b + 0.1 * c));
};

/**
 * What the mic is hearing, right now: a rolling window of levels, newest on the
 * right. Samples itself so the screen around it doesn't re-render 10×/second;
 * `getLevel` returns 0–1 and must be stable across renders.
 *
 * This is the *only* place the recorder's level is polled. Android metering is
 * `MediaRecorder.maxAmplitude`, which reports the peak since the last read and
 * resets on read — a second poller elsewhere would eat half the peaks and both
 * would flatten out. Anything else that wants the levels takes `onSample`.
 */
export function LiveWaveform({
  getLevel,
  onSample,
  active,
  bars = 32,
  height = 28,
}: {
  getLevel: () => number;
  onSample?: (v: number) => void;
  active: boolean;
  bars?: number;
  height?: number;
}) {
  const C = useC();
  const { reduceMotion } = useTheme();
  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(LEVEL_FLOOR));
  const step = useRef(0); // sample counter, drives the fallback shape
  const flat = useRef(0); // consecutive samples stuck at the floor
  // read through a ref so a new `onSample` identity never restarts the interval
  const sink = useRef(onSample);
  useEffect(() => {
    sink.current = onSample;
  });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const v = Math.min(1, Math.max(LEVEL_FLOOR, getLevel()));
      sink.current?.(v); // the SAVED waveform is only ever real samples — see below
      step.current += 1;
      flat.current = v <= LEVEL_FLOOR ? flat.current + 1 : 0;
      // Some devices never report a level: Android metering reads
      // MediaRecorder.getMaxAmplitude(), and where that returns 0 the bars would
      // sit dead flat for the whole take and look broken. After DEAD_AFTER
      // samples of nothing we drive the *display* from a travelling wave instead,
      // so it reads as "recording" rather than as "not working". It is not a level
      // meter at that point, and it is deliberately kept out of `onSample`.
      const shown = flat.current > DEAD_AFTER ? synthetic(step.current) : v;
      if (!reduceMotion) setLevels((prev) => [...prev.slice(1), shown]);
    }, SAMPLE_MS);
    return () => clearInterval(t);
  }, [active, reduceMotion, getLevel]);
  // paused/stopped draws flat rather than freezing on the last window
  const shown = active && !reduceMotion ? levels : Array(bars).fill(LEVEL_FLOOR);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height }}>
      {shown.map((v, i) => (
        <View key={i} style={{ width: 3, borderRadius: 1.5, height: Math.max(3, v * height), backgroundColor: active ? C.accent : C.staffLine }} />
      ))}
    </View>
  );
}

/** "Attach take" — six bars of a waveform, replacing the old record dot. */
export function WaveformIcon({ color, width = 22 }: { color?: string; width?: number }) {
  const C = useC();
  const fill = color ?? C.accent;
  const bars: [x: number, y: number, h: number][] = [
    [0, 6, 4], [4, 3, 10], [8, 0, 16], [12, 4, 8], [16, 1.5, 13], [20, 5.5, 5],
  ];
  return (
    <Svg width={width} height={(width / 22) * 16} viewBox="0 0 22 16">
      {bars.map(([x, y, h]) => (
        <Rect key={x} x={x} y={y} width={2} height={h} rx={1} fill={fill} />
      ))}
    </Svg>
  );
}

const useS = themed(({ C }: T) => StyleSheet.create({
  tempoRow: { fontFamily: F.body, color: C.subStrong },
  term: { fontFamily: F.accentMed, color: C.accent },
}));

/**
 * Odometer digits (#44) — each column rolls to its new value instead of the
 * number cutting. `height` must be the text's line height, since that is the
 * distance one digit travels. Digits only, so tabular figures keep it steady.
 */
export function RollingNumber({ value, style, height }: { value: number | string; style?: TextStyle; height: number }) {
  const chars = String(value).split('');
  return (
    <View style={{ flexDirection: 'row', height, overflow: 'hidden' }}>
      {chars.map((c, i) => (
        // keyed by position: digit 3 stays digit 3 as the number changes, so the
        // column rolls rather than being torn down and rebuilt at the new value
        <Digit key={`${chars.length}-${i}`} digit={Number(c)} style={style} height={height} />
      ))}
    </View>
  );
}

function Digit({ digit, style, height }: { digit: number; style?: TextStyle; height: number }) {
  const { reduceMotion } = useTheme();
  const [y] = useState(() => new Animated.Value(-digit * height));
  useEffect(() => {
    const to = -digit * height;
    if (reduceMotion) return y.setValue(to);
    Animated.spring(y, { toValue: to, useNativeDriver: true, friction: 9, tension: 70 }).start();
  }, [digit, height, reduceMotion, y]);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Text key={n} style={[style, { height, lineHeight: height, textAlign: 'center' }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}
