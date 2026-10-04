// Guided plan runner (#17) — replaces the plain timer while a plan runs.
// One session is logged per segment, so focus stats stay per piece/technique.
import * as Haptics from 'expo-haptics';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
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
import { getActiveRun, getTransientPlan, resolvePlan, setActiveRun, setTransientPlan, TRANSIENT_PLAN_ID, useTransientPlan } from '@/lib/plan-run-state';
import { hideSessionNotice, showSessionNotice } from '@/lib/session-notice';
import { dateKey, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function PlanRunner() {
  // `run`: a token every fresh start passes (resuming passes none). Tab screens
  // stay mounted, so the key-remount is what gives each start a clean run —
  // without it a second start of the same routine reopened the finished one's
  // review / ended state. The last token is kept so a resume (no token) never
  // remounts the run in flight.
  const { id, run } = useLocalSearchParams<{ id: string; run?: string }>();
  const [token, setToken] = useState(run ?? '');
  if (run && run !== token) setToken(run);
  return <Runner key={`${id}:${run || token}`} id={id} />;
}

function Runner({ id }: { id: string }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const inst = useInstrumentFilter();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const metro = useMetronome();
  const focused = useIsFocused();

  // a saved routine, or the unsaved "Suggested for today" plan (#95), which lives
  // in plan-run-state rather than the store and is dropped once the run is over
  useTransientPlan();
  const plan = resolvePlan(store.plans, id);
  // the transient plan this runner was started with, if any: a restart of the
  // suggested session remounts the runner (new run token) after the card has
  // already set the next plan, and the old runner's cleanup must not drop that one
  const [ownTransient] = useState(() => (id === TRANSIENT_PLAN_ID ? getTransientPlan() : null));
  useEffect(() => () => {
    // leaving with no run in flight: nothing to come back to
    if (ownTransient && !getActiveRun() && getTransientPlan() === ownTransient) setTransientPlan(null);
  }, [ownTransient]);
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
      (resolvePlan(store.plans, id)?.segments ?? []).some(
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
  // ended with nothing to review: this tab stays mounted after router.back(), so
  // the clock must stop or the auto-advance would end (and go back) every tick
  const [over, setOver] = useState(false);
  const [metroOpen, setMetroOpen] = useState(false);
  const [runStart] = useState(() => resumed?.runStart ?? Date.now());
  // what has actually been logged, so the review reports real minutes and never
  // points at a break (which logs nothing)
  const logged = useRef({ min: resumed?.loggedMin ?? 0, lastId: resumed?.lastId ?? '' });
  const paused = startedAt === null;

  // segments removed in the editor mid-run: land on the last one that still exists
  const segCount = plan?.segments.length ?? 0;
  if (segCount > 0 && idx >= segCount) setIdx(segCount - 1);
  const seg = plan?.segments[idx];
  const segSec = (seg?.min ?? 0) * 60;
  const planName = plan ? plan.name.trim() || store.t('practice.defaultPlanName') : '';

  // mirror the run into the module singleton so it survives unmounts and the
  // shell can offer a way back. While this screen is unmounted (or JS is asleep
  // behind a locked screen) the segment can overrun; on return the auto-advance
  // carries the overrun into the next segments, so no practice time is lost.
  useEffect(() => {
    if (!plan || review || over) return;
    setActiveRun({ planId: plan.id, idx, startedAt, accum, runStart, loggedMin: logged.current.min, lastId: logged.current.lastId });
  }, [plan, idx, startedAt, accum, runStart, review, over]);

  // every segment removed (or the routine deleted) mid-run: end the run rather
  // than strand a blank screen with no way out. Only leave if we're on screen —
  // this tab stays mounted, and backing out of the editor that did it is wrong.
  const stranded = !review && !seg;
  useEffect(() => {
    if (!stranded || getActiveRun()?.planId !== id) return;
    if (metro.running) metro.toggle();
    setActiveRun(null);
    hideSessionNotice();
    if (focused) router.back();
  }, [stranded, id, metro, router, focused]);

  // startSegment sets each later segment's tempo; the first one needs it once too
  const metroApplied = useRef(!!resumed);
  useEffect(() => {
    if (metroApplied.current || !seg) return;
    metroApplied.current = true;
    if (metro.running && seg.bpm) metro.setBpm(seg.bpm);
    if (metro.running && seg.focus.kind === 'Break') metro.toggle(); // silence for the rest (#59)
  }, [seg, metro]);

  // the run's foreground service (Android), so the routine survives the screen
  // going off; the segment's own clock ticks in the notification. Taken down
  // with the run — in finish() and the early exit — not on unmount, since a tab
  // switch unmounts this screen while the run goes on.
  const segName = seg ? (seg.focus.kind === 'Break' ? store.t('planRun.break') : seg.focus.name) : '';
  const pausedWord = store.t('practice.paused');
  useEffect(() => {
    if (!plan || !seg || review || over) return;
    const elapsedMs = accum * 1000 + (startedAt !== null ? Date.now() - startedAt : 0);
    showSessionNotice({ title: planName, subtitle: startedAt !== null ? segName : `${segName} · ${pausedWord}`, running: startedAt !== null, elapsedMs });
  }, [plan, planName, seg, segName, pausedWord, startedAt, accum, review, over]);

  useEffect(() => {
    if (startedAt === null || review || over) return;
    const tick = () => setSeconds(accum + Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, accum, review, over]);

  const isBreak = seg?.focus.kind === 'Break';

  const logSegment = (sec: number) => {
    if (!plan || !seg || seg.focus.kind === 'Break') return ''; // #59: rests are never logged
    const min = Math.max(1, Math.round(sec / 60));
    // the run's answer only applies to segments actually played on that instrument:
    // a piano-only piece sitting in a violin routine keeps its own tag
    const segPiece = store.allPieces.find((p) => p.name === seg.focus.name);
    // …and the tab in view only applies to a piece that is on it, same as Practice
    const on = runInst && onInstrument(segPiece ?? {}, runInst) ? runInst : segPiece && !onInstrument(segPiece, inst) ? undefined : inst || undefined;
    // filed under the day the segment began, so a run across midnight doesn't empty the evening
    const segStart = Date.now() - sec * 1000;
    const sessId = store.logMinutes(min, seg.focus.name, seg.focus.kind, dateKey(new Date(segStart)), plan.id, on, undefined, segStart);
    logged.current = { min: logged.current.min + min, lastId: sessId };
    return sessId;
  };

  // carry: seconds already played past the previous segment's end
  const startSegment = (i: number, carry = 0) => {
    if (!plan) return;
    setIdx(i);
    setAccum(carry);
    setSeconds(carry);
    setStartedAt(Date.now());
    const next = plan.segments[i];
    if (metro.running && next.bpm) metro.setBpm(next.bpm);
    if (metro.running && next.focus.kind === 'Break') metro.toggle(); // silence for the rest (#59)
  };

  const abandon = () => {
    setOver(true);
    if (metro.running) metro.toggle();
    setActiveRun(null);
    hideSessionNotice();
    router.back();
  };

  const finish = (lastId: string) => {
    if (!plan) return;
    // nothing logged at all (only breaks, or skipped through): no session to review
    const sessId = lastId || logged.current.lastId;
    if (!sessId) return abandon();
    if (metro.running) metro.toggle();
    setActiveRun(null);
    hideSessionNotice();
    setStartedAt(null);
    // logged minutes, not planned ones — breaks and skips count nothing (#59)
    setReview({ id: sessId, min: Math.max(1, logged.current.min), focusName: planName, start: runStart, end: Date.now() });
  };

  // sec 0: skipped before anything worth logging
  const advance = (sec: number, carry = 0) => {
    if (!plan) return;
    const sessId = sec > 0 ? logSegment(sec) : '';
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (idx + 1 < plan.segments.length) startSegment(idx + 1, carry);
    else finish(sessId);
  };

  // auto-advance at segment end
  // ponytail: checked on the 1s tick, not a precise deadline timer — ±1s is fine here
  const wantAdvance = !!seg && seconds >= segSec && !paused && !review && !over;
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  useEffect(() => {
    // idx in deps: an overrun longer than the next segment cascades through it too
    if (wantAdvance) advanceRef.current(segSec, seconds - segSec);
  }, [wantAdvance, segSec, idx, seconds]);

  if (!plan || !seg) return null;

  const end = () => {
    // confirm only when ending saves this segment — breaks and <30 s later segments save nothing
    const saves = !isBreak && (seconds >= 30 || (idx === 0 && seconds > 0));
    const midSegment = saves && seconds < segSec;
    const doEnd = () => {
      if (seconds >= 30) {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        finish(logSegment(seconds));
      } else if (idx > 0) finish(''); // review what was already logged
      else if (seconds > 0) finish(logSegment(60));
      else abandon();
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
  const timerLabel = store.t(isBreak ? 'planRun.timerLabelBreak' : 'planRun.timerLabel', { min: Math.floor(shown / 60), sec: shown % 60 });
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
          {planName}
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
        <Text testID="run-timer" style={s.timer} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="timer" accessibilityLabel={timerLabel}>
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
          onPress={() => advance(seconds >= 30 ? seconds : 0)}
        />
      </View>

      <InstrumentAsk
        visible={askInst}
        name={planName}
        subline={store.t('instrumentAsk.sublineRoutine', { name: planName })}
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
