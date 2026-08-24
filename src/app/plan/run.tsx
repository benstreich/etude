// Guided plan runner (#17) — replaces the plain timer while a plan runs.
// One session is logged per segment, so focus stats stay per piece/technique.
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MetronomeSheet } from '@/components/metronome';
import { SessionReview, type ReviewSession } from '@/components/session-review';
import { Overline } from '@/components/ui';
import { useBeat, useMetronome } from '@/lib/metronome';
import { getActiveRun, setActiveRun } from '@/lib/plan-run-state';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function PlanRunner() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const metro = useMetronome();
  const beat = useBeat();

  const plan = store.plans.find((p) => p.id === id);
  // resume the run-in-progress if this screen was unmounted mid-run (tab switch)
  const [resumed] = useState(() => {
    const r = getActiveRun();
    return r && r.planId === id ? r : null;
  });
  const [idx, setIdx] = useState(resumed?.idx ?? 0);
  // wall-clock timer, same pattern as the practice screen
  const [startedAt, setStartedAt] = useState<number | null>(() => (resumed ? resumed.startedAt : Date.now()));
  const [accum, setAccum] = useState(resumed?.accum ?? 0);
  const [seconds, setSeconds] = useState(resumed?.accum ?? 0);
  const [review, setReview] = useState<ReviewSession | null>(null);
  const [metroOpen, setMetroOpen] = useState(false);
  const [runStart] = useState(() => resumed?.runStart ?? Date.now());
  const paused = startedAt === null;

  const seg = plan?.segments[idx];
  const segSec = (seg?.min ?? 0) * 60;

  // mirror the run into the module singleton so it survives unmounts and the
  // shell can offer a way back. ponytail: while this screen is unmounted the
  // segment can overrun; on return one auto-advance logs the planned minutes
  // and the run continues from now — overflow beyond one segment isn't spread.
  useEffect(() => {
    if (!plan || review) return;
    setActiveRun({ planId: plan.id, idx, startedAt, accum, runStart });
  }, [plan, idx, startedAt, accum, runStart, review]);

  useEffect(() => {
    if (startedAt === null || review) return;
    const tick = () => setSeconds(accum + Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, accum, review]);

  const logSegment = (sec: number) => {
    if (!plan || !seg) return '';
    const min = Math.max(1, Math.round(sec / 60));
    return store.logMinutes(min, seg.focus.name, seg.focus.kind, undefined, plan.id);
  };

  const startSegment = (i: number) => {
    if (!plan) return;
    setIdx(i);
    setAccum(0);
    setSeconds(0);
    setStartedAt(Date.now());
    const next = plan.segments[i];
    if (metro.running && next.bpm) metro.setBpm(next.bpm);
  };

  const finish = (lastId: string) => {
    if (!plan) return;
    if (metro.running) metro.toggle();
    setActiveRun(null);
    const total = plan.segments.slice(0, idx).reduce((a, x) => a + x.min, 0) + Math.round(seconds / 60);
    setStartedAt(null);
    setReview({ id: lastId, min: Math.max(1, total), focusName: plan.name, start: runStart, end: Date.now() });
  };

  const advance = (sec: number) => {
    if (!plan) return;
    const sessId = logSegment(sec);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (idx + 1 < plan.segments.length) startSegment(idx + 1);
    else finish(sessId);
  };

  // auto-advance at segment end
  // ponytail: checked on the 1s tick, not a precise deadline timer — ±1s is fine here
  const wantAdvance = !!seg && seconds >= segSec && !paused && !review;
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  useEffect(() => {
    if (wantAdvance) advanceRef.current(segSec);
  }, [wantAdvance, segSec]);

  if (!plan || !seg) return null;

  const end = () => {
    const midSegment = seconds > 0 && seconds < segSec;
    const doEnd = () => {
      if (seconds >= 30) advance(seconds);
      else if (idx > 0 || seconds > 0) finish(logSegment(Math.max(60, seconds)));
      else {
        if (metro.running) metro.toggle();
        setActiveRun(null);
        router.back();
      }
    };
    if (!midSegment) return doEnd();
    if (Platform.OS === 'web') {
      if (window.confirm(`${store.t('planRun.endTitle')} ${store.t('planRun.endMessage')}`)) doEnd();
      return;
    }
    Alert.alert(store.t('planRun.endTitle'), store.t('planRun.endMessage'), [
      { text: store.t('planRun.keepGoing'), style: 'cancel' },
      { text: store.t('planRun.end'), style: 'destructive', onPress: doEnd },
    ]);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const title = seg.note ? `${seg.focus.name} · ${seg.note}` : seg.focus.name;

  // opens the full sheet so tempo/time-sig/ramp stay adjustable mid-session (#31)
  const openMetro = () => {
    if (seg.bpm && !metro.running) metro.setBpm(seg.bpm);
    setMetroOpen(true);
  };

  return (
    <View style={[s.page, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.topRow}>
        <Text style={s.planName} numberOfLines={1}>
          {plan.name}
        </Text>
        <Pressable hitSlop={10} onPress={end}>
          <Text style={s.endLink}>{store.t('planRun.end')}</Text>
        </Pressable>
      </View>

      <View style={s.pillRow}>
        {plan.segments.map((sg, i) => (
          <View key={i} style={[s.pill, { flex: sg.min }, i < idx && { backgroundColor: C.accent }]}>
            {i === idx && (
              <View style={[s.pillFill, { width: `${Math.min(100, (seconds / Math.max(1, sg.min * 60)) * 100)}%` }]} />
            )}
          </View>
        ))}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Overline>
          {store.t('planRun.segmentOf', { n: idx + 1, total: plan.segments.length })}
        </Overline>
        <Text style={s.segTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={s.timer} numberOfLines={1} adjustsFontSizeToFit>
          {mm}:{ss}
        </Text>
        <Text style={s.of}>{store.t('planRun.ofMin', { min: seg.min })}</Text>
        <Pressable style={[s.metroChip, metro.running && { backgroundColor: C.accent }]} onPress={openMetro}>
          <View style={[s.metroDot, metro.running && { backgroundColor: C.bg, opacity: beat % 2 === 0 ? 1 : 0.35 }]} />
          <Text style={[s.metroText, metro.running && { color: C.bg }]}>
            {metro.running || seg.bpm
              ? store.t('planRun.metronomeBpm', { bpm: metro.running ? metro.bpm : seg.bpm })
              : store.t('metronome.metronome')}
          </Text>
        </Pressable>
      </View>

      <View style={s.controls}>
        <Pressable
          style={s.pauseBtn}
          onPress={() => {
            if (paused) setStartedAt(Date.now());
            else {
              setAccum(seconds);
              setStartedAt(null);
            }
          }}>
          <Text style={s.pauseText}>{paused ? '▶' : '❚❚'}</Text>
        </Pressable>
        <Pressable style={s.nextBtn} onPress={() => advance(Math.max(60, seconds))}>
          <Text style={s.nextText}>{idx + 1 < plan.segments.length ? store.t('planRun.next') : store.t('planRun.finish')}</Text>
        </Pressable>
        <View style={{ width: 56 }} />
      </View>

      <MetronomeSheet visible={metroOpen} onClose={() => setMetroOpen(false)} />

      <SessionReview
        session={review}
        onClose={() => {
          setReview(null);
          router.back();
        }}
      />
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planName: { flex: 1, fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub },
  endLink: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.tertiary },
  pillRow: { flexDirection: 'row', gap: 5, marginTop: 14 },
  pill: { height: 5, borderRadius: r(999), backgroundColor: C.track, overflow: 'hidden' },
  pillFill: { height: 5, borderRadius: r(999), backgroundColor: C.accent },
  segTitle: { fontFamily: F.head, fontSize: fs(27), color: C.ink, textAlign: 'center' },
  timer: { fontFamily: F.head, fontSize: fs(64), letterSpacing: -1, color: C.ink, fontVariant: ['tabular-nums'] },
  of: { fontFamily: F.body, fontSize: fs(13.5), color: C.sub },
  metroChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 9, paddingHorizontal: 15, marginTop: 10 },
  metroDot: { width: 7, height: 7, borderRadius: r(4), backgroundColor: C.accent },
  metroText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  pauseBtn: { width: 56, height: 56, borderRadius: r(28), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pauseText: { fontSize: fs(16), color: C.ink },
  nextBtn: { width: 74, height: 74, borderRadius: r(37), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.bg },
}));
