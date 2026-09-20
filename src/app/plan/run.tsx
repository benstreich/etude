// Guided plan runner (#17) — replaces the plain timer while a plan runs.
// One session is logged per segment, so focus stats stay per piece/technique.
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InstrumentAsk } from '@/components/instrument-ask';
import { PlayIcon } from '@/components/icons';
import { MetronomeSheet } from '@/components/metronome';
import { MeasureBar, Tempo, TickDot } from '@/components/motifs';
import { SessionReview, type ReviewSession } from '@/components/session-review';
import { Text } from '@/components/text';
import { EntryRow, Overline, PulseRing, useInstrumentFilter } from '@/components/ui';
import { instrumentChoices, onInstrument } from '@/lib/instrument-math';
import { useMetronome } from '@/lib/metronome';
import { getActiveRun, setActiveRun } from '@/lib/plan-run-state';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function PlanRunner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // tab screens stay mounted — key-remount resets the run state when a
  // different plan is started, else the old run's segment index leaks in
  return <Runner key={id} id={id} />;
}

function Runner({ id }: { id: string }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const inst = useInstrumentFilter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const metro = useMetronome();

  const plan = store.plans.find((p) => p.id === id);
  // resume the run-in-progress if this screen was unmounted mid-run (tab switch)
  const [resumed] = useState(() => {
    const r = getActiveRun();
    return r && r.planId === id ? r : null;
  });
  const [idx, setIdx] = useState(resumed?.idx ?? 0);
  // #58 follow-up: a routine can hold a piece played on two instruments, and every
  // segment logs its own session. Asked once for the whole run rather than per
  // segment — a question between two bars of a timed routine is worse than the bug.
  // A resumed run has already been through this, so it never asks twice.
  const [askInst, setAskInst] = useState(
    () =>
      !resumed &&
      (store.plans.find((p) => p.id === id)?.segments ?? []).some(
        (sg) => sg.focus.kind !== 'Break' && instrumentChoices(store.allPieces.find((p) => p.name === sg.focus.name), inst).length > 0
      )
  );
  const [runInst, setRunInst] = useState<string | null>(null);
  // wall-clock timer, same pattern as the practice screen. It starts paused behind
  // the instrument question — a clock running under a modal bills the player for
  // time spent answering it.
  const [startedAt, setStartedAt] = useState<number | null>(() => (resumed ? resumed.startedAt : askInst ? null : Date.now()));
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

  const isBreak = seg?.focus.kind === 'Break';

  const logSegment = (sec: number) => {
    if (!plan || !seg || seg.focus.kind === 'Break') return ''; // #59: rests are never logged
    const min = Math.max(1, Math.round(sec / 60));
    // the run's answer only applies to segments actually played on that instrument:
    // a piano-only piece sitting in a violin routine keeps its own tag
    const segPiece = store.allPieces.find((p) => p.name === seg.focus.name);
    const on = runInst && onInstrument(segPiece ?? {}, runInst) ? runInst : inst || undefined;
    return store.logMinutes(min, seg.focus.name, seg.focus.kind, undefined, plan.id, on);
  };

  const startSegment = (i: number) => {
    if (!plan) return;
    setIdx(i);
    setAccum(0);
    setSeconds(0);
    setStartedAt(Date.now());
    const next = plan.segments[i];
    if (metro.running && next.bpm) metro.setBpm(next.bpm);
    if (metro.running && next.focus.kind === 'Break') metro.toggle(); // silence for the rest (#59)
  };

  const finish = (lastId: string) => {
    if (!plan) return;
    if (metro.running) metro.toggle();
    setActiveRun(null);
    // break segments don't count as practice (#59)
    const total = plan.segments.slice(0, idx).reduce((a, x) => a + (x.focus.kind === 'Break' ? 0 : x.min), 0) + (isBreak ? 0 : Math.round(seconds / 60));
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

  // fraction of the whole plan done: whole segments behind us plus this one's progress
  const planMin = plan.segments.reduce((a, sg) => a + sg.min, 0) || 1;
  const doneMin = plan.segments.slice(0, idx).reduce((a, sg) => a + sg.min, 0);
  const runDone = Math.min(1, (doneMin + Math.min(seg.min, seconds / 60)) / planMin);

  const focusName = isBreak ? store.t('planRun.break') : seg.focus.name;
  const title = seg.note ? `${focusName} · ${seg.note}` : focusName;
  // a break counts down; practice counts up
  const shown = isBreak ? Math.max(0, segSec - seconds) : seconds;
  const mm = String(Math.floor(shown / 60)).padStart(2, '0');
  const ss = String(shown % 60).padStart(2, '0');
  const chipBpm = metro.running ? metro.bpm : (seg.bpm ?? null);
  const nextSeg = plan.segments[idx + 1];
  const nextLabel = nextSeg ? (nextSeg.focus.kind === 'Break' ? store.t('planRun.break') : nextSeg.focus.name) : undefined;

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
        <Pressable testID="run-end" hitSlop={10} onPress={end}>
          <Text style={s.endLink}>{store.t('planRun.end')}</Text>
        </Pressable>
      </View>

      <MeasureBar segments={plan.segments.map((sg) => sg.min)} done={runDone} />

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
        <Text style={s.of}>{isBreak ? store.t('planRun.breakHint') : store.t('planRun.ofMin', { min: seg.min })}</Text>
        {!isBreak && (
        <Pressable style={s.metroChip} onPress={openMetro}>
          <View style={{ width: 8, height: 8 }}>
            <PulseRing color={C.accent} size={8} active={metro.running} />
            <TickDot bpm={chipBpm ?? 0} on={metro.running} color={C.accent} />
          </View>
          {chipBpm ? <Tempo bpm={chipBpm} size={13.5} /> : <Text style={s.metroText}>{store.t('metronome.metronome')}</Text>}
        </Pressable>
        )}
      </View>

      <View>
        <EntryRow
          top
          keySize={48}
          keyStyle={{ borderWidth: 1.5, borderColor: C.ink, backgroundColor: 'transparent' }}
          keyContent={
            paused ? (
              <PlayIcon color={C.ink} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={{ width: 3, height: 14, borderRadius: 1, backgroundColor: C.ink }} />
                <View style={{ width: 3, height: 14, borderRadius: 1, backgroundColor: C.ink }} />
              </View>
            )
          }
          title={paused ? store.t('practice.resume') : store.t('practice.pause')}
          right={null}
          onPress={() => {
            if (paused) setStartedAt(Date.now());
            else {
              setAccum(seconds);
              setStartedAt(null);
            }
          }}
        />
        <EntryRow
          top={false}
          close
          testID="run-next"
          keySize={48}
          keyStyle={{ backgroundColor: C.ink }}
          keyContent={<View style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: C.bg }} />}
          title={idx + 1 < plan.segments.length ? store.t('planRun.next') : store.t('planRun.finish')}
          subline={nextLabel}
          right={null}
          onPress={() => advance(Math.max(60, seconds))}
        />
      </View>

      <InstrumentAsk
        visible={askInst}
        name={plan.name}
        subline={store.t('instrumentAsk.sublineRoutine', { name: plan.name })}
        choices={[
          ...new Set(
            plan.segments.flatMap((sg) =>
              sg.focus.kind === 'Break' ? [] : instrumentChoices(store.allPieces.find((p) => p.name === sg.focus.name), inst)
            )
          ),
        ]}
        // dismissing without answering still starts the run; the segments then fall
        // back to their own tags exactly as they did before this question existed
        onClose={() => {
          setAskInst(false);
          if (startedAt === null) setStartedAt(Date.now());
        }}
        onPick={(on) => {
          setRunInst(on);
          setAskInst(false);
          setStartedAt(Date.now());
        }}
      />
      <MetronomeSheet visible={metroOpen} onClose={() => setMetroOpen(false)} />

      <SessionReview
        session={review}
        onClose={() => {
          // ponytail: just leave — clearing `review` here would re-run the
          // effect above with a live plan and resurrect the run we just
          // finished, leaving a stale "in progress" pill behind. The screen
          // unmounts, so the review state goes with it.
          router.back();
        }}
      />
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planName: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.subStrong },
  endLink: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.subStrong },
  segTitle: { fontFamily: F.head, fontSize: fs(29), color: C.ink, textAlign: 'center' },
  timer: { fontFamily: F.head, fontSize: fs(66), letterSpacing: -1, color: C.ink, fontVariant: ['tabular-nums'] },
  of: { fontFamily: F.body, fontSize: fs(15), color: C.subStrong },
  metroChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 9, paddingHorizontal: 15, marginTop: 10 },
  metroDot: { width: 7, height: 7, borderRadius: r(4), backgroundColor: C.accent },
  metroText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
}));
