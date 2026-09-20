// Your score, in full (#88): the same practice log Home's mini-staff draws,
// engraved instead as a real page of music — bars wrapped into systems down
// the screen, a key signature pinned once at the top, a meter on every bar
// that changes it. Set in Bravura, the SMuFL reference font, the same as
// Home's staff; only stems and beams are still drawn (there is no glyph for
// either in real engraving, they are always drawn). lib/engrave.ts's per-bar
// layout is unchanged, extended here with system wrapping.
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { Pressable } from '@/components/press';
import { Text } from '@/components/text';
import { fmtTime } from '@/components/progress/styles';
import { BackLink } from '@/components/ui';
import {
  BAR_PAD,
  BEAM_T,
  CLEF_X,
  DOT_R,
  flagOrigin,
  GLYPH,
  glyphFontSize,
  headerW,
  headGlyph,
  headOrigin,
  layoutSystems,
  LINE_W,
  METER_COL_W,
  noteTop,
  PAD_REST_X,
  REST_X,
  signatureMarks,
  STEM_W,
  yOf,
  type System,
} from '@/lib/engrave';
import { tap } from '@/lib/haptics';
import { barsFor, SIGNATURE, valueFor, type MelodyKey } from '@/lib/melody';
import { useMelodyPlayer } from '@/lib/melody-play';
import { dateKey, dayLabel, useStore } from '@/lib/store';
import { F, themed, useTheme, type T } from '@/lib/theme';

const WEEKS_MAX = 12;
const WEEKS_DEFAULT = 4;

// system geometry — SP is the one staff space everything else is a multiple of
const SP = 13;
const STAFF_TOP = 40;
const BLOCK_H = 140;
const RULES = [0, 1, 2, 3, 4].map((i) => STAFF_TOP + i * SP);
const LINE = LINE_W(SP);
const STEM = STEM_W(SP);
const NOTE_FS = glyphFontSize(SP);
const SYS_GAP = 16;
const PAGE_PAD = 20;

const dateFromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "Sat 12" or "Sat 12 Sep" — month dropped when both ends share one. */
const rehearsalLabel = (first: string, last: string, lang: string) => {
  const a = dateFromKey(first);
  const b = dateFromKey(last);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (first === last) return a.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const left = a.toLocaleDateString(lang, sameMonth ? { weekday: 'short', day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
  const right = b.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
};

export default function Score() {
  const s = useS();
  const { C } = useTheme();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const melody = useMelodyPlayer();
  const { width: winW } = useWindowDimensions();

  const [weeksShown, setWeeksShown] = useState(WEEKS_DEFAULT);
  const [selectedBack, setSelectedBack] = useState(0); // 0 = today
  const [panelOpen, setPanelOpen] = useState(true);

  const melodyKey: MelodyKey = store.melodyKey;
  const sig = SIGNATURE[melodyKey] ?? 0;
  const headW = headerW(sig, SP);
  const sysW = Math.max(160, winW - PAGE_PAD * 2);

  const days = weeksShown * 7;
  const dateKeys = useMemo(() => {
    const out: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(store.now);
      d.setDate(d.getDate() - i);
      out.push(dateKey(d));
    }
    return out;
  }, [days, store.now]);
  const dow = store.t('logPast.dowLetters');
  const bars = useMemo(
    () =>
      barsFor(dateKeys, store.minutesByDate, store.sessions, melodyKey).map((b) => ({
        ...b,
        day: dow[dateFromKey(b.date).getDay()],
        isToday: b.date === store.today,
      })),
    [dateKeys, store.minutesByDate, store.sessions, melodyKey, dow, store.today]
  );

  const systems = useMemo(() => layoutSystems(bars, store.dailyGoal, sysW, SP, sysW - headW), [bars, store.dailyGoal, sysW, headW]);
  const atStart = weeksShown >= WEEKS_MAX;

  const selectedDate = dateKeys[Math.max(0, dateKeys.length - 1 - selectedBack)] ?? store.today;
  const selectedTotal = store.minutesByDate[selectedDate] ?? 0;
  const selectedSessions = store.sessions.filter((x) => x.date === selectedDate).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  const selectDate = (date: string) => {
    tap();
    const idx = dateKeys.indexOf(date);
    if (idx >= 0) setSelectedBack(dateKeys.length - 1 - idx);
  };

  const togglePlay = () => {
    tap();
    if (melody.playing) return melody.stop();
    // from the day that's selected, as tapping a day on Home does — not from the
    // top of the range. Every day off still sounds its rest, so opening on four
    // weeks and playing from the start meant sitting through weeks of silence
    // before the first note.
    const from = bars.findIndex((b) => b.date === selectedDate);
    melody.play(from >= 0 ? bars.slice(from) : bars, store.dailyGoal, melodyKey);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 22 }]}>
        <View style={s.headRow}>
          <BackLink label={store.t('tabs.home')} onPress={() => router.back()} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[s.headBtn, { backgroundColor: C.track }]} onPress={togglePlay}>
              <Text style={[s.headBtnText, { color: C.accent }]}>{melody.playing ? '❚❚' : '▶'}</Text>
            </Pressable>
            <Pressable
              style={[s.headBtn, panelOpen ? { backgroundColor: C.accentTint } : { backgroundColor: C.track }]}
              onPress={() => setPanelOpen((v) => !v)}>
              <Text style={[s.headBtnText, { color: panelOpen ? C.accent : C.ink }]}>{store.t('fullScore.log')}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.title}>{store.t('fullScore.title')}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {rehearsalLabel(dateKeys[0], dateKeys[dateKeys.length - 1], store.lang)}
          <Text style={s.metaDivider}> {'│'} </Text>
          <Text onPress={() => router.push('/profile')}>{store.t('settings.majorKey', { key: melodyKey })}</Text>
          <Text style={s.metaDivider}> {'│'} </Text>
          {store.t('fullScore.goalBeats', { min: store.dailyGoal })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PAD, paddingBottom: 84, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <Pressable
          testID="score-earlier"
          style={[s.edgeRow, atStart && { opacity: 0.35 }]}
          disabled={atStart}
          onPress={() => {
            tap();
            // functional update: two quick taps must not both read the same stale value
            setWeeksShown((w) => Math.min(WEEKS_MAX, w + 1));
          }}>
          <Text style={[s.edgeGlyph, { transform: [{ scaleY: -1 }] }]}>{'›'}</Text>
          <Text style={s.edgeText}>{atStart ? store.t('fullScore.startOfLog') : store.t('fullScore.earlier')}</Text>
          <Text style={s.edgeSub}>{store.t('fullScore.showingWeeks', { count: weeksShown })}</Text>
        </Pressable>

        {systems.map((sys, i) => (
          <SystemRow
            key={i}
            sys={sys}
            index={i}
            isLast={i === systems.length - 1}
            headW={i === 0 ? headW : 0}
            sig={sig}
            goal={store.dailyGoal}
            bars={bars}
            selectedDate={selectedDate}
            sounding={melody.playing ?? undefined}
            lang={store.lang}
            t={store.t}
            onSelect={selectDate}
          />
        ))}

        <Pressable
          testID="score-later"
          style={[s.edgeRow, weeksShown <= 1 && { opacity: 0.28 }]}
          disabled={weeksShown <= 1}
          onPress={() => {
            tap();
            setWeeksShown((w) => Math.max(1, w - 1));
          }}>
          <Text style={s.edgeText}>{weeksShown <= 1 ? store.t('fullScore.thisIsToday') : store.t('fullScore.later')}</Text>
          <Text style={s.edgeGlyph}>{'›'}</Text>
        </Pressable>
      </ScrollView>

      <DayPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onReopen={() => setPanelOpen(true)}
        dateLabel={dayLabel(selectedDate, store.today, store.t, store.lang)}
        total={selectedTotal}
        goal={store.dailyGoal}
        sessions={selectedSessions}
        t={store.t}
      />
    </View>
  );
}

/** One system: its rehearsal mark, then the staff with every bar it holds. */
function SystemRow({
  sys,
  index,
  isLast,
  headW,
  sig,
  goal,
  bars,
  selectedDate,
  sounding,
  lang,
  t,
  onSelect,
}: {
  sys: System;
  index: number;
  isLast: boolean;
  headW: number;
  sig: number;
  goal: number;
  bars: { date: string; day: string; isToday: boolean; notes: { id: string; min: number; pitch: number }[] }[];
  selectedDate: string;
  sounding: string | undefined;
  lang: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onSelect: (date: string) => void;
}) {
  const s = useS();
  const { C } = useTheme();
  const first = sys.bars[0]?.date;
  const last = sys.bars.at(-1)?.date;
  const total = sys.bars.reduce((a, b) => a + (bars.find((x) => x.date === b.date)?.notes.reduce((m, n) => m + n.min, 0) ?? 0), 0);
  const endX = headW + (sys.bars.at(-1) ? sys.bars.at(-1)!.x + sys.bars.at(-1)!.width : 0) + 1.5;

  return (
    <View style={{ marginBottom: SYS_GAP }}>
      {first && last && (
        <View style={s.rehearsalRow}>
          <Text style={s.rehearsal} numberOfLines={1}>
            {rehearsalLabel(first, last, lang)}
          </Text>
          <Text style={s.rehearsalTotal}>{fmtTime(total, t)}</Text>
        </View>
      )}
      <View style={{ height: BLOCK_H }}>
        <Svg width={headW + sys.width} height={BLOCK_H}>
          {RULES.map((y) => (
            <Rect key={y} x={0} y={y} width={endX} height={LINE} fill={C.staffLine} />
          ))}
          {index === 0 && (
            <G transform={`translate(0, ${STAFF_TOP})`}>
              {/* Bravura's gClef sits on the G line by design — no empirical offset needed */}
              <SvgText x={CLEF_X(SP)} y={yOf(2, SP)} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                {GLYPH.gClef}
              </SvgText>
              {signatureMarks(sig, SP).map((m, i) => (
                <SvgText key={i} x={m.x} y={m.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                  {m.sharp ? GLYPH.accidentalSharp : GLYPH.accidentalFlat}
                </SvgText>
              ))}
            </G>
          )}
          {sys.bars.map((b) => {
            const bar = bars.find((x) => x.date === b.date);
            const on = b.date === selectedDate || b.date === sounding;
            const ink = on || bar?.isToday ? C.accent : C.ink;
            const quiet = on ? C.accent : C.sub;
            const beaten = (bar?.notes.reduce((a, n) => a + n.min, 0) ?? 0) > goal;
            const barX = headW + b.x;
            const meterW = b.meter !== null ? METER_COL_W(b.meter, SP) : 0;
            const xOff = BAR_PAD(SP) + meterW;
            const lastNote = b.lay?.notes.at(-1);
            const isFinal = isLast && b.date === last;
            return (
              <G key={b.date} transform={`translate(${barX}, ${STAFF_TOP})`}>
                <Rect x={0} y={0} width={LINE * 1.2} height={4 * SP} fill={C.barline} />
                {isFinal && <Rect x={b.width - 1.5 - 0.28 * SP} y={0} width={0.28 * SP} height={4 * SP} fill={C.sub} />}
                {b.meter !== null && (
                  <G>
                    <SvgText x={BAR_PAD(SP) + meterW / 2} y={yOf(6, SP)} textAnchor="middle" fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.sub}>
                      {GLYPH.timeSig(b.meter)}
                    </SvgText>
                    <SvgText x={BAR_PAD(SP) + meterW / 2} y={yOf(2, SP)} textAnchor="middle" fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.sub}>
                      {GLYPH.timeSig(4)}
                    </SvgText>
                  </G>
                )}
                <G transform={`translate(${xOff}, 0)`}>
                  {!b.lay && (
                    <SvgText x={REST_X(SP)} y={SP} fontFamily={F.smufl} fontSize={NOTE_FS} fill={quiet}>
                      {GLYPH.restWhole}
                    </SvgText>
                  )}
                  {b.lay?.beams.map((bm, i) => (
                    <Polygon
                      key={`bm${i}`}
                      points={`${bm.x1},${bm.y1} ${bm.x2},${bm.y2} ${bm.x2},${bm.y2 + (bm.down ? -BEAM_T(SP) : BEAM_T(SP))} ${bm.x1},${bm.y1 + (bm.down ? -BEAM_T(SP) : BEAM_T(SP))}`}
                      fill={ink}
                    />
                  ))}
                  {b.lay?.notes.map((n) => {
                    const head = headOrigin(n.head, n.x, n.y, SP);
                    const flag = n.flag && n.stem ? flagOrigin(n.down, n.stem.x + (n.down ? 0 : STEM), n.stem.y2, SP) : null;
                    return (
                      <G key={n.id}>
                        {n.stem && <Rect x={n.stem.x} y={Math.min(n.stem.y1, n.stem.y2)} width={STEM} height={Math.abs(n.stem.y2 - n.stem.y1)} fill={ink} />}
                        {flag && (
                          <SvgText x={flag.x} y={flag.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={ink}>
                            {n.down ? GLYPH.flag8thDown : GLYPH.flag8thUp}
                          </SvgText>
                        )}
                        <SvgText x={head.x} y={head.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={ink}>
                          {headGlyph(n.head)}
                        </SvgText>
                        {n.dot && <Circle cx={n.dot.x} cy={n.dot.y} r={DOT_R(SP)} fill={ink} />}
                      </G>
                    );
                  })}
                  {beaten && lastNote && (
                    <SvgText x={lastNote.x} y={noteTop(lastNote, SP) - 0.4 * SP} textAnchor="middle" fontFamily={F.smufl} fontSize={NOTE_FS} fill={ink}>
                      {GLYPH.fermataAbove}
                    </SvgText>
                  )}
                  {b.pad > 0 && b.lay && (
                    <SvgText x={b.lay.width + PAD_REST_X(SP)} y={2 * SP} fontFamily={F.smufl} fontSize={NOTE_FS} fill={quiet}>
                      {GLYPH.restEighth}
                    </SvgText>
                  )}
                </G>
              </G>
            );
          })}
        </Svg>
        {sys.bars.map((b) => {
          const bar = bars.find((x) => x.date === b.date);
          const on = b.date === selectedDate;
          return (
            <Pressable key={b.date} style={{ position: 'absolute', left: headW + b.x, width: b.width, bottom: 0, top: 0 }} onPress={() => onSelect(b.date)}>
              <Text style={[s.dayLetter, { color: on || bar?.isToday ? C.accent : C.tertiary }]}>{bar?.day ?? ''}</Text>
              {on && <View style={s.dayUnderline} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


/** The floating card over the score — never a fixed footer, never a backdrop. */
function DayPanel({
  open,
  onClose,
  onReopen,
  dateLabel,
  total,
  goal,
  sessions,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onReopen: () => void;
  dateLabel: string;
  total: number;
  goal: number;
  sessions: { id: string; title: string; min: number }[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const s = useS();
  const { C, reduceMotion } = useTheme();
  const v = useSharedValue(1);
  React.useEffect(() => {
    v.value = reduceMotion ? 1 : withTiming(1, { duration: 220, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [open, dateLabel, reduceMotion, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 22 }] }));

  if (!open) {
    return (
      <Pressable style={s.chip} onPress={onReopen}>
        <Text style={s.chipText}>
          {dateLabel} {'·'} {fmtTime(total, t)}
        </Text>
      </Pressable>
    );
  }

  const totalColor = total === 0 ? C.tertiary : total >= goal ? C.success : C.ink;

  return (
    <Animated.View style={[s.panel, style]}>
      <View style={s.panelHeadRow}>
        <Text style={s.panelTitle} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text style={[s.panelTotal, { color: totalColor }]}>{fmtTime(total, t)}</Text>
        <Pressable style={s.panelClose} hitSlop={6} onPress={onClose}>
          <Text style={s.panelCloseText}>{'✕'}</Text>
        </Pressable>
      </View>
      {sessions.length === 0 ? (
        <Text style={s.panelRest}>{t('fullScore.rest')}</Text>
      ) : (
        sessions.map((sess) => (
          <View key={sess.id} style={s.panelRow}>
            <Text style={s.panelGlyph}>{valueFor(sess.min, goal).glyph}</Text>
            <Text style={s.panelName} numberOfLines={1}>
              {sess.title}
            </Text>
            <Text style={s.panelMin}>{sess.min}</Text>
          </View>
        ))
      )}
    </Animated.View>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.hairline },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headBtn: { height: 30, borderRadius: r(8), paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    headBtnText: { fontFamily: F.bodySemi, fontSize: fs(13) },
    title: { marginTop: 12, fontFamily: F.head, fontSize: fs(28), lineHeight: fs(32), letterSpacing: -0.4, color: C.ink },
    meta: { marginTop: 4, fontFamily: F.body, fontSize: fs(14), color: C.subStrong },
    metaDivider: { color: C.staffLine },

    edgeRow: { height: 52, alignItems: 'center', justifyContent: 'center' },
    edgeGlyph: { fontSize: fs(16), color: C.accent },
    edgeText: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.accent },
    edgeSub: { marginTop: 2, fontFamily: F.body, fontSize: fs(11.5), color: C.tertiary },

    rehearsalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
    rehearsal: { fontFamily: F.bodySemi, fontSize: fs(10), letterSpacing: 1.2, textTransform: 'uppercase', color: C.tertiary },
    rehearsalTotal: { fontFamily: F.body, fontSize: fs(10), color: C.faint },

    dayLetter: { position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 0.5 },
    dayUnderline: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -8, width: 16, height: 1.5, backgroundColor: C.accent },

    chip: {
      position: 'absolute',
      bottom: 30,
      alignSelf: 'center',
      height: 34,
      paddingHorizontal: 16,
      borderRadius: r(999),
      backgroundColor: 'rgba(28,26,23,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: { fontFamily: F.bodyMed, fontSize: fs(13), color: '#FFFFFF' },

    panel: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 26,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderRadius: r(18),
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    panelHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    panelTitle: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(17), color: C.ink },
    panelTotal: { fontFamily: F.bodySemi, fontSize: fs(15) },
    panelClose: { width: 30, height: 30, borderRadius: r(15), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
    panelCloseText: { fontSize: fs(13), color: C.sub },
    panelRest: { height: 30, textAlignVertical: 'center', fontFamily: F.body, fontSize: fs(14), color: C.tertiary },
    panelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 30 },
    panelGlyph: { width: 20, textAlign: 'center', fontFamily: F.notation, fontSize: fs(17), color: C.accent },
    panelName: { flex: 1, minWidth: 0, fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
    panelMin: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.subStrong, fontVariant: ['tabular-nums'] },
  })
);
