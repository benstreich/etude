// Musical motifs from the soul pass: progress drawn as notation instead of as
// a ring or a pill row. Both draw in on mount and then sit still — the whole
// motion budget for these screens.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { Pressable } from '@/components/press';
import { Bump } from '@/components/motion';
import { Text } from '@/components/text';
import { BEAM_T, flagPath, HEAD_RY, HEAD_TILT, headerW, headRx, holeRx, holeRy, layoutBar, LINE_W, signatureMarks, STEM_W, yOf, type BarLayout } from '@/lib/engrave';
import { eighthsFor, meterFor, SIGNATURE, type MelodyKey, type MelodyNote } from '@/lib/melody';
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
const GAUGE_EASE = Easing.bezier(0.33, 1, 0.68, 1);

export function FermataMark({ pct, goalMet, size = 220 }: { pct: number; goalMet: boolean; size?: number }) {
  const C = useC();
  const { reduceMotion } = useTheme();
  const clamped = Math.min(100, Math.max(0, pct));
  const [v] = useState(() => new Animated.Value(reduceMotion ? clamped : 0));
  useEffect(() => {
    if (reduceMotion) v.setValue(clamped);
    else Animated.timing(v, { toValue: clamped, duration: 600, easing: GAUGE_EASE, useNativeDriver: false }).start();
  }, [clamped, reduceMotion, v]);
  // the arc crossfades to success the moment the goal is met, alongside the fill
  const [goalV] = useState(() => new Animated.Value(goalMet ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) goalV.setValue(goalMet ? 1 : 0);
    else Animated.timing(goalV, { toValue: goalMet ? 1 : 0, duration: 600, easing: GAUGE_EASE, useNativeDriver: false }).start();
  }, [goalMet, reduceMotion, goalV]);
  const dashoffset = v.interpolate({ inputRange: [0, 100], outputRange: [FERMATA_LEN, 0] });
  const stroke = goalV.interpolate({ inputRange: [0, 1], outputRange: [C.accent, C.success] });
  return (
    <Svg width={size} height={(size / 220) * 176} viewBox="2 5 36 28.8" style={{ overflow: 'visible' }}>
      <Path d={FERMATA_D} fill="none" stroke={C.accent} strokeOpacity={0.22} strokeWidth={3.4} strokeLinecap="round" />
      <AnimatedFermataPath
        d={FERMATA_D}
        fill="none"
        stroke={stroke}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeDasharray={[FERMATA_LEN, FERMATA_LEN]}
        strokeDashoffset={dashoffset}
      />
      <Circle cx={20} cy={27} r={3.4} fill={goalMet ? C.accent : C.logoDot} />
    </Svg>
  );
}

// Staff geometry in the unit a score is built from: the staff space S. Five
// rules 4S tall, with room above for a fermata and for the clef's flourish.
const S = 16;
const STAFF_TOP = 36;
const RULES = [0, 1, 2, 3, 4].map((i) => STAFF_TOP + i * S);
const MELODY_H = RULES[4] + 30; // rules plus the day letters beneath
const BAR_PAD = 0.4 * S; // the barline and its breathing room
const METER_W = 1.45 * S; // the time signature's column, only where the meter changes
const REST_W = 2.2 * S; // a day off
const PAD_W = 1.6 * S; // the eighth rest that squares a bar with its signature
const LINE = LINE_W(S);
const STEM = STEM_W(S);

/**
 * The practice log as a melody: one bar per day, one note per session in it, its
 * pitch owned by the piece or technique practised (lib/melody.ts) and its value
 * that session's minutes against the daily goal — so a bar fills up as the day
 * does, and how the day was split is its rhythm. Each bar carries its own meter,
 * written where it changes, because a bar is a day and lasts as long as the day
 * did. A fermata over a bar means the goal was beaten, a day off is a rest.
 * Today is the rightmost bar, and the staff opens scrolled to it.
 *
 * The notes are drawn rather than typed (lib/engrave.ts): the notation font has
 * only stem-up glyphs, which are wrong above the middle line, and cannot beam.
 * The clef and key signature are pinned to the left and never scroll, so the
 * staff always says what it is being read in.
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
  /** the key the staff is read in; its signature is written once, at the left */
  melodyKey: MelodyKey;
  /** dateKey of the day being read below the staff; its notes and letter go accent */
  selected?: string;
  /** dateKey of the bar playing right now (lib/melody-play.ts); lit like the selection */
  sounding?: string;
  onSelect?: (date: string) => void;
}) {
  const C = useC();
  const scroll = useRef<ScrollView>(null);
  const sig = SIGNATURE[melodyKey] ?? 0;
  const headW = headerW(sig, S);

  // Every bar is a day, so every bar has its own meter — written only where it
  // changes, the way a score does, so a steady run of days stays quiet. A day off
  // rests the whole bar and inherits the meter, like any full-bar rest.
  const metered = useMemo(() => {
    const out: { b: (typeof bars)[number]; meter: number | null; pad: number; lay: BarLayout | null; w: number }[] = [];
    let prev = 0; // the meter still in force, carried across days off
    for (const b of bars) {
      const m = meterFor(eighthsFor(b.notes, goal));
      const meter = m && m.beats !== prev ? m.beats : null;
      if (m) prev = m.beats;
      const lay = b.notes.length ? layoutBar(b.notes, goal, S) : null;
      const pad = m?.padEighths ?? 0;
      out.push({ b, meter, pad, lay, w: BAR_PAD + (meter !== null ? METER_W : 0) + (lay ? lay.width : REST_W) + (pad ? PAD_W : 0) });
    }
    return out;
  }, [bars, goal]);
  const width = metered.reduce((w, x) => w + x.w, 0) + 24;
  const jumped = useRef(false);

  // a plain render function, not a nested component: a component defined inside
  // render is a new type every time and would remount all 84 bars per re-render
  const renderBar = ({ b, meter, pad, lay, w }: (typeof metered)[number]) => {
    const on = b.date === selected || b.date === sounding;
    const ink = on || b.isToday ? C.accent : C.ink;
    const quiet = on ? C.accent : C.sub;
    const beaten = b.notes.reduce((a, n) => a + n.min, 0) > goal;
    const xOff = BAR_PAD + (meter !== null ? METER_W : 0);
    const last = lay?.notes[lay.notes.length - 1];
    return (
      <Pressable key={b.date} disabled={!onSelect} onPress={() => onSelect?.(b.date)}>
        {/* the landed day answers the tap: the same spring the stars settle on */}
        <Bump trigger={on} peak={1.12}>
        <Svg width={w} height={MELODY_H}>
          <G transform={`translate(0, ${STAFF_TOP})`}>
            <Rect x={0} y={0} width={LINE * 1.2} height={4 * S} fill={C.barline} />
            {/* numerals, not the font's signature glyphs: these sit at the size the rules dictate */}
            {meter !== null && (
              <G>
                <SvgText x={BAR_PAD + METER_W / 2} y={yOf(6, S) + 0.55 * S} textAnchor="middle" fontFamily={F.bodyMed} fontSize={1.55 * S} fill={C.sub}>
                  {String(meter)}
                </SvgText>
                <SvgText x={BAR_PAD + METER_W / 2} y={yOf(2, S) + 0.55 * S} textAnchor="middle" fontFamily={F.bodyMed} fontSize={1.55 * S} fill={C.sub}>
                  4
                </SvgText>
              </G>
            )}
            <G transform={`translate(${xOff}, 0)`}>
              {/* a whole rest hangs under the second rule, whatever the meter says */}
              {!lay && <Rect x={0.9 * S} y={S} width={1.15 * S} height={0.45 * S} fill={quiet} />}
              {lay?.beams.map((bm, i) => (
                <Polygon
                  key={`b${i}`}
                  points={`${bm.x1},${bm.y1} ${bm.x2},${bm.y2} ${bm.x2},${bm.y2 + (bm.down ? -BEAM_T(S) : BEAM_T(S))} ${bm.x1},${bm.y1 + (bm.down ? -BEAM_T(S) : BEAM_T(S))}`}
                  fill={ink}
                />
              ))}
              {lay?.notes.map((n) => (
                <G key={n.id}>
                  {n.stem && <Rect x={n.stem.x} y={Math.min(n.stem.y1, n.stem.y2)} width={STEM} height={Math.abs(n.stem.y2 - n.stem.y1)} fill={ink} />}
                  {n.flag && n.stem && <Path d={flagPath(n.stem.x + (n.down ? 0 : STEM), n.stem.y2, n.down, S)} fill={ink} />}
                  <Ellipse
                    cx={n.x}
                    cy={n.y}
                    rx={headRx(n.head, S)}
                    ry={HEAD_RY(S)}
                    fill={ink}
                    transform={n.head === 'whole' || n.head === 'breve' ? undefined : `rotate(${HEAD_TILT} ${n.x} ${n.y})`}
                  />
                  {/* an open head is a ring: the staff line behind it does not show through */}
                  {n.head !== 'quarter' && n.head !== 'eighth' && (
                    <Ellipse
                      cx={n.x}
                      cy={n.y}
                      rx={holeRx(n.head, S)}
                      ry={holeRy(n.head, S)}
                      fill={C.bg}
                      transform={`rotate(${n.head === 'whole' || n.head === 'breve' ? -22 : HEAD_TILT} ${n.x} ${n.y})`}
                    />
                  )}
                  {n.head === 'breve' && (
                    <G>
                      <Rect x={n.x - 1.05 * S} y={n.y - 0.62 * S} width={STEM} height={1.24 * S} fill={ink} />
                      <Rect x={n.x + 1.05 * S - STEM} y={n.y - 0.62 * S} width={STEM} height={1.24 * S} fill={ink} />
                    </G>
                  )}
                  {n.dot && <Circle cx={n.dot.x} cy={n.dot.y} r={0.15 * S} fill={ink} />}
                </G>
              ))}
              {/* beating the goal is the day's doing, not one session's, so the mark rides the bar */}
              {beaten && last && (
                <SvgText x={last.x} y={-0.55 * S} textAnchor="middle" fontFamily={F.notation} fontSize={1.5 * S} fill={ink}>
                  {'\u{1D110}'}
                </SvgText>
              )}
              {/* the day stopped half a beat short — the bar says so rather than
                  quietly not adding up to its own signature */}
              {pad > 0 && lay && (
                <SvgText x={lay.width + 0.4 * S} y={2 * S + 0.9 * S} fontFamily={F.notation} fontSize={2.3 * S} fill={quiet}>
                  {'\u{1D13E}'}
                </SvgText>
              )}
            </G>
          </G>
        </Svg>
        </Bump>
        <Text style={{ position: 'absolute', bottom: 0, left: 0, width: w, textAlign: 'center', fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 0.5, color: on || b.isToday ? C.accent : C.tertiary }}>
          {b.day}
        </Text>
        {on && <View style={{ position: 'absolute', bottom: -6, left: w / 2 - 8, width: 16, height: 1.5, backgroundColor: C.accent }} />}
      </Pressable>
    );
  };

  return (
    <View style={{ height: MELODY_H + 6 }}>
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
        style={{ height: MELODY_H, marginLeft: headW }}
        contentContainerStyle={{ width, height: MELODY_H }}>
        {RULES.map((top) => (
          <View key={top} style={{ position: 'absolute', left: 0, right: 0, top, height: LINE, backgroundColor: C.staffLine }} />
        ))}
        <View style={{ position: 'absolute', flexDirection: 'row', left: 0, right: 0, top: 0, bottom: 0 }}>
          {metered.map(renderBar)}
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 3, marginTop: STAFF_TOP }}>
            <View style={{ width: LINE * 1.2, height: 4 * S, backgroundColor: C.barline }} />
            <View style={{ width: 0.28 * S, height: 4 * S, backgroundColor: C.sub }} />
          </View>
        </View>
      </ScrollView>
      {/* The clef and key signature stay put while the weeks scroll under them. A
          scrolling staff would otherwise lose the one thing that says what it is
          being read in, which is why every note used to carry its own accidental. */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: headW, height: MELODY_H, backgroundColor: C.bg }}>
        <Svg width={headW} height={MELODY_H}>
          {RULES.map((top) => (
            <Rect key={top} x={0} y={top} width={headW} height={LINE} fill={C.staffLine} />
          ))}
          <G transform={`translate(0, ${STAFF_TOP})`}>
            <SvgText x={0.5 * S} y={yOf(2, S) + 2.25 * S} fontFamily={F.notation} fontSize={4.2 * S} fill={C.ink}>
              {'\u{1D11E}'}
            </SvgText>
            {signatureMarks(sig, S).map((m, i) => (
              <SvgText key={i} x={m.x} y={m.y + (m.sharp ? 0.42 * S : 0.3 * S)} fontFamily={F.notation} fontSize={1.85 * S} fill={C.ink}>
                {m.sharp ? '♯' : '♭'}
              </SvgText>
            ))}
          </G>
        </Svg>
      </View>
    </View>
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
  const { reduceMotion } = useTheme();
  const target = Math.min(100, Math.max(0, done * 100));
  const [fillPct] = useState(() => new Animated.Value(reduceMotion ? target : 0));
  useEffect(() => {
    if (reduceMotion) return fillPct.setValue(target);
    Animated.timing(fillPct, { toValue: target, duration: 500, easing: Easing.bezier(0.33, 1, 0.68, 1), useNativeDriver: false }).start();
  }, [target, reduceMotion, fillPct]);
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
          width: fillPct.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
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
/**
 * ~1.8s of floor from the very first sample before we stop believing the mic.
 * Counted only until the mic proves itself once: a rest, a soft passage or a
 * pause between phrases is silence we should draw as silence, not a reason to
 * switch to the stand-in. A device that never reports anything trips this inside
 * the first two seconds and stays there for the take.
 */
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
  const flat = useRef(0); // samples seen at the floor before the mic ever moved
  const heard = useRef(false); // the mic reported a real level at least once this take
  // read through a ref so a new `onSample` identity never restarts the interval
  const sink = useRef(onSample);
  useEffect(() => {
    sink.current = onSample;
  });
  useEffect(() => {
    if (!active) return;
    // a fresh run of the meter: the previous take's verdict must not carry over,
    // or a take that ended in silence opens the next one on the stand-in shape
    step.current = 0;
    flat.current = 0;
    heard.current = false;
    const t = setInterval(() => {
      const v = Math.min(1, Math.max(LEVEL_FLOOR, getLevel()));
      sink.current?.(v); // the SAVED waveform is only ever real samples — see below
      step.current += 1;
      if (v > LEVEL_FLOOR) heard.current = true;
      else if (!heard.current) flat.current += 1;
      // Some devices never report a level: Android metering reads
      // MediaRecorder.getMaxAmplitude(), and where that returns 0 the bars would
      // sit dead flat for the whole take and look broken. When the mic has said
      // nothing at all for DEAD_AFTER samples we drive the *display* from a
      // travelling wave instead, so it reads as "recording" rather than as "not
      // working". Once a real level arrives we never come back here — silence
      // after that is the room being quiet, and drawing it as playing would lie.
      // It is not a level meter at that point, and is kept out of `onSample`.
      const shown = !heard.current && flat.current > DEAD_AFTER ? synthetic(step.current) : v;
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
export function RollingNumber({ value, style, height, fast }: { value: number | string; style?: TextStyle; height: number; fast?: boolean }) {
  const chars = String(value).split('');
  return (
    <View style={{ flexDirection: 'row', height, overflow: 'hidden' }}>
      {chars.map((c, i) => (
        // keyed by position: digit 3 stays digit 3 as the number changes, so the
        // column rolls rather than being torn down and rebuilt at the new value
        <Digit key={`${chars.length}-${i}`} digit={Number(c)} style={style} height={height} fast={fast} />
      ))}
    </View>
  );
}

function Digit({ digit, style, height, fast }: { digit: number; style?: TextStyle; height: number; fast?: boolean }) {
  const { reduceMotion } = useTheme();
  const [y] = useState(() => new Animated.Value(-digit * height));
  useEffect(() => {
    const to = -digit * height;
    if (reduceMotion) return y.setValue(to);
    // the BPM roll (fast) settles quicker than the session/timer odometer: it
    // changes in 1-BPM steps far more often than a timer ticks
    Animated.spring(y, fast ? { toValue: to, useNativeDriver: true, friction: 10, tension: 140 } : { toValue: to, useNativeDriver: true, friction: 9, tension: 70 }).start();
  }, [digit, height, reduceMotion, y, fast]);
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
