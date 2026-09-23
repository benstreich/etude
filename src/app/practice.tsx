import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon, PlayIcon } from '@/components/icons';
import { LadderTally } from '@/components/ladder-tally';
import { LogPastModal } from '@/components/log-past';
import { MetronomeSheet } from '@/components/metronome';
import { LiveWaveform, MetNote, RollingNumber, StaffProgress } from '@/components/motifs';
import { InstrumentAsk } from '@/components/instrument-ask';
import { ScoreViewer, useScores } from '@/components/score';
import { SessionReview, type ReviewSession } from '@/components/session-review';
import { SuggestedCard } from '@/components/suggested';
import { Text } from '@/components/text';
import { ActionChip, ChipRow, EntryRow, Overline, PulseRing, SearchField, SectionHead, UnderlineTabs, useInstrumentFilter } from '@/components/ui';
import { tap, thud } from '@/lib/haptics';
import { instrumentChoices, instrumentLabel, onInstrument } from '@/lib/instrument-math';
import { useMetronome } from '@/lib/metronome';
import { cancelBreakEnd, scheduleBreakEnd } from '@/lib/reminders';
import { restoreLive } from '@/lib/session-math';
import { hideSessionNotice, showSessionNotice } from '@/lib/session-notice';
import { Piece, useStore } from '@/lib/store';
import { pickRecordings } from '@/lib/import-recording';
import { useTakeRecorder } from '@/lib/use-take-recorder';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

/**
 * One of the tool strip's four equal cells (record, tempo, tuner, score). Only
 * the live cell fills — everywhere else is the whole signal, so the background
 * crossfades rather than snapping.
 */
function ToolCell({
  glyph,
  label,
  live = false,
  divider = false,
  disabled = false,
  testID,
  onPress,
}: {
  glyph: (color: string) => React.ReactNode;
  label: string;
  live?: boolean;
  divider?: boolean;
  disabled?: boolean;
  testID?: string;
  onPress: () => void;
}) {
  const s = useS();
  const C = useC();
  const { reduceMotion } = useTheme();
  const on = useSharedValue(live ? 1 : 0);
  useEffect(() => {
    on.value = reduceMotion ? (live ? 1 : 0) : withTiming(live ? 1 : 0, { duration: 200 });
  }, [live, reduceMotion, on]);
  const bgStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.value, [0, 1], ['transparent', C.accent]) }));
  const color = live ? C.bg : C.ink;
  return (
    <Pressable
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={[s.toolCell, divider && s.toolCellDivider, disabled && { opacity: 0.4 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />
      <View style={s.toolGlyphBox}>{glyph(color)}</View>
      <Text style={[s.toolLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Practice() {
  const s = useS();
  const C = useC();
  const { fs } = useTheme();
  const store = useStore();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const metronome = useMetronome();
  // a session the last process left behind (store.liveSession) is revived right
  // in these initializers — before the first paint, so a restart never shows
  // the idle screen mid-session and never loses the minutes (#restoreLive)
  const [revived] = useState(() => (store.liveSession ? { ...store.liveSession, ...restoreLive(store.liveSession, Date.now()) } : null));
  const [focus, setFocus] = useState<{ name: string; kind: 'Piece' | 'Technique' } | null>(revived ? { name: revived.name, kind: revived.kind } : null);
  const [running, setRunning] = useState(!!revived);
  // the staff nav (StaffNav in _layout.tsx) reads this to hide itself while a session runs
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: running ? { display: 'none' } : undefined });
  }, [running, navigation]);
  // wall-clock based so time keeps counting while the app is backgrounded
  const [startedAt, setStartedAt] = useState<number | null>(revived?.startedAt ?? null); // null = paused
  const [accum, setAccum] = useState(revived?.accum ?? 0); // seconds banked across pauses
  const [seconds, setSeconds] = useState(revived?.accum ?? 0);
  const [pastOpen, setPastOpen] = useState(false);
  const [metroOpen, setMetroOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ReviewSession | null>(null); // saved session shown in the review moment
  const sessionStart = useRef(revived?.startClock ?? 0); // wall clock when the session was started
  const [startClock, setStartClock] = useState(revived?.startClock ?? 0); // same instant, mirrored to state so the header can read it during render
  const paused = startedAt === null;
  const inst = useInstrumentFilter();
  // #58 follow-up: which instrument THIS session counts towards. A piece on two
  // instruments can't be filed by its tag order — the player is asked at the start
  // and the answer rides with the session until it is saved.
  const [sessionInst, setSessionInst] = useState<string | null>(revived?.inst ?? null);
  const [askInst, setAskInst] = useState(false);
  const focusPiece = store.allPieces.find((p) => p.name === focus?.name);
  // the trouble spot this session is about (#91): null = the whole piece. One per
  // session; re-tapping another chip simply changes it, last selection wins.
  const [spotId, setSpotId] = useState<string | null>(revived?.spot ?? null);
  const openSpots = (focusPiece?.spots ?? []).filter((sp) => !sp.resolvedAt);
  const instChoices = instrumentChoices(focusPiece, inst);
  const scores = useScores(focus?.kind === 'Piece' ? focus.name : undefined);
  const [scoreOpen, setScoreOpen] = useState<(typeof scores)[number] | null>(null);
  // practice breaks (#59): the reminder fires each time the timer crosses another
  // `breakEvery` interval; a break pauses the session timer and counts down separately
  const [breaksSeen, setBreaksSeen] = useState(revived?.breaksSeen ?? 0); // intervals already answered (started or skipped)
  const [breakEnd, setBreakEnd] = useState<number | null>(null); // wall clock when the current break ends
  const [breakLeft, setBreakLeft] = useState(0);
  const breakNotif = useRef<string | null>(null);
  const breakDue = store.breakEvery > 0 && !paused && breakEnd === null && seconds >= store.breakEvery * 60 * (breaksSeen + 1);
  const buzz = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };
  useEffect(() => {
    if (breakDue) buzz();
  }, [breakDue]);
  useEffect(() => {
    if (breakEnd === null) return;
    const tick = () => setBreakLeft(Math.max(0, Math.ceil((breakEnd - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [breakEnd]);
  const breakOver = breakEnd !== null && breakLeft === 0;
  useEffect(() => {
    if (breakOver) buzz();
  }, [breakOver]);
  const startBreak = (min = 5) => {
    setAccum(seconds);
    setStartedAt(null);
    setBreaksSeen((n) => n + 1);
    setBreakEnd(Date.now() + min * 60000);
    scheduleBreakEnd(min * 60).then((id) => (breakNotif.current = id));
  };
  const adjustBreak = (dMin: number) => {
    if (breakEnd === null) return;
    const total = Math.round((breakEnd - Date.now()) / 60000) + dMin; // whole minutes left after the change
    if (total < 1 || total > 10) return;
    setBreakEnd(breakEnd + dMin * 60000);
    cancelBreakEnd(breakNotif.current);
    scheduleBreakEnd(Math.round((breakEnd + dMin * 60000 - Date.now()) / 1000)).then((id) => (breakNotif.current = id));
  };
  const endBreak = () => {
    cancelBreakEnd(breakNotif.current);
    breakNotif.current = null;
    setBreakEnd(null);
    setStartedAt(Date.now());
  };
  // the take recorder, shared with the piece page (lib/use-take-recorder.ts).
  // `focus` is read at stop time, so changing focus mid-take files it correctly.
  const {
    recording,
    paused: recPaused,
    micLevel,
    onSample,
    toggle: toggleRec,
    pauseResume: pauseResumeRec,
    discard: discardTake,
  } = useTakeRecorder(() => focus?.name ?? null);

  // a take recorded elsewhere — phone voice memo, interface, another app — filed
  // under the same focus the session is about
  const importTakes = async () => {
    if (!focus) return;
    for (const t of await pickRecordings()) store.addRecording(focus.name, t.uri, t.sec, undefined, t.name);
  };

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setSeconds(accum + Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, startedAt, accum]);

  // The session in flight is mirrored into the store, so a process death cannot
  // lose it. `lastSeen` heartbeats every 10s: restoreLive() keeps the clock
  // running through a brief death and comes back paused after a long one. The
  // setter rides a ref — it is a new function per store render, and depending
  // on it would loop this effect through its own writes.
  const setLive = useRef(store.setLiveSession);
  useEffect(() => {
    setLive.current = store.setLiveSession;
  });
  useEffect(() => {
    if (!running || !focus) return;
    const write = () =>
      setLive.current({ name: focus.name, kind: focus.kind, startedAt, accum, startClock: sessionStart.current, inst: sessionInst, breaksSeen, spot: spotId, lastSeen: Date.now() });
    write();
    const t = setInterval(write, 10000);
    // Android freezes this interval the moment the screen goes off, so the last
    // heartbeat is otherwise the one before the pocket. The state change itself
    // still reaches JS — stamp it, so a kill hours later banks up to here.
    const sub = AppState.addEventListener('change', write);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [running, focus, startedAt, accum, sessionInst, breaksSeen, spotId]);

  // The session's foreground service (Android): the process stays alive with the
  // screen off, and the notification's own clock keeps ticking. Repainted on
  // transitions only — start, pause, resume, a new focus — never per second.
  const sessionWord = store.t('practice.session');
  const pausedWord = store.t('practice.paused');
  useEffect(() => {
    if (!running || !focus) {
      hideSessionNotice();
      return;
    }
    const elapsedMs = accum * 1000 + (startedAt !== null ? Date.now() - startedAt : 0);
    showSessionNotice({ title: focus.name, subtitle: startedAt !== null ? sessionWord : pausedWord, running: startedAt !== null, elapsedMs });
  }, [running, focus, startedAt, accum, sessionWord, pausedWord]);

  const q = query.trim().toLowerCase();
  // every piece in the repertoire is practisable — reaching the last stage used
  // to hide it here, which just looked like the piece had gone missing (#41).
  // Finished ones sort last so "what are you working on" still reads right.
  const finished = (p: Piece) => p.stage >= store.stages.length - 1;
  const pieces = store.pieces
    .filter((p) => !p.archived && p.name.toLowerCase().includes(q) && onInstrument(p, inst))
    .sort((a, b) => Number(finished(a)) - Number(finished(b)));
  // store.techniques is a name-only list, so it can't answer "which instrument" —
  // read the piece records instead and apply the same rule Repertoire uses, or
  // picking Cello would offer techniques that belong to the guitar (#58)
  const techniques = store.allPieces.filter(
    (p) =>
      p.kind === 'Technique' &&
      !p.archived &&
      p.name.toLowerCase().includes(q) &&
      onInstrument(p, inst)
  );
  const plans = store.plans.filter((p) => p.name.toLowerCase().includes(q));

  /** Start the clock. `on` is the answer to the instrument question, or null when it never had to be asked. */
  const beginSession = (on: string | null) => {
    setSessionInst(on);
    setSeconds(0);
    setAccum(0);
    sessionStart.current = Date.now();
    setStartClock(sessionStart.current);
    setBreaksSeen(0);
    setStartedAt(Date.now());
    setRunning(true);
  };

  const endSave = async () => {
    if (!focus) return;
    if (recording) await toggleRec();
    const min = Math.max(1, Math.round(seconds / 60));
    // #58 follow-up: the same piece can be practised on two instruments, so the
    // session records the one picked when it started, then the tab in view, and
    // only then falls back to the piece's own first tag
    // the store drops a spot that was resolved or deleted mid-session (#91)
    const id = store.logMinutes(min, focus.name, focus.kind, undefined, undefined, sessionInst || inst || undefined, spotId ?? undefined);
    store.setLiveSession(null);
    setSpotId(null);
    setRunning(false);
    setStartedAt(null);
    setAccum(0);
    setSeconds(0);
    setBreaksSeen(0);
    if (breakEnd !== null) endBreak();
    // focus stays set until the review closes — "Attach take" files under it
    setReview({ id, min, focusName: focus.name, start: sessionStart.current, end: Date.now() });
  };

  const closeReview = async () => {
    if (recording) await toggleRec(); // an attached take still running gets banked
    setReview(null);
    setFocus(null);
    setSessionInst(null); // the next session asks again; a stale answer would misfile it
    router.push('/');
  };

  if (running && focus) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    const elapsedMin = seconds / 60;
    const toGoal = Math.max(0, Math.round(store.dailyGoal - store.todayMin - elapsedMin));
    const minSoFar = Math.max(1, Math.round(seconds / 60));
    const breakInMin = store.breakEvery > 0 ? Math.max(0, store.breakEvery * (breaksSeen + 1) - Math.floor(seconds / 60)) : null;
    // the nav bar is hidden while running, so this screen owns the bottom inset —
    // without it "Discard session" sits under the gesture bar and can't be tapped
    return (
      <View style={[s.runPage, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
        <View style={s.runHeadRow}>
          <Overline>{store.t('practice.session')}</Overline>
          <Text style={s.runStarted}>{store.t('practice.startedAt', { time: new Date(startClock).toLocaleTimeString(store.lang, { hour: 'numeric', minute: '2-digit' }) })}</Text>
        </View>
        <View style={s.runCenter}>
          <Text style={s.runFocus}>{focus.name}</Text>
          <View style={s.timerRow}>
            <RollingNumber value={mm} style={s.timer} height={fs(100)} />
            <Text style={[s.timer, { lineHeight: fs(100) }]}>:</Text>
            <RollingNumber value={ss} style={s.timer} height={fs(100)} />
          </View>
          <View style={s.statusRow}>
            {!paused && (
              <View style={{ width: 8, height: 8 }}>
                <PulseRing color={C.accent} size={8} active={!paused} />
                <View style={s.statusDot} />
              </View>
            )}
            <Text style={[s.status, paused ? { color: C.sub } : { color: C.accent }]}>
              {paused ? store.t('practice.paused') : (
                <>
                  {store.t('practice.running')} · <Text style={{ fontFamily: F.accent }}>{tempoTerm(metronome.bpm)}</Text>
                </>
              )}
            </Text>
          </View>
          <View style={{ marginTop: 36, width: '100%' }}>
            <StaffProgress pct={((store.todayMin + elapsedMin) / Math.max(1, store.dailyGoal)) * 100} />
          </View>
          <View style={s.runProgressMeta}>
            <Text style={s.runProgressText}>{store.t('practice.loggedToday', { min: store.todayMin })}</Text>
            <Text style={[s.runProgressText, { fontFamily: F.body }]}>{toGoal === 0 ? store.t('practice.goalMetToday') : store.t('practice.toDoubleBar', { min: toGoal })}</Text>
          </View>
          {breakDue && (
            <View style={s.breakBanner}>
              <Text style={s.breakText}>{store.t('practice.breakDue', { min: store.breakEvery * (breaksSeen + 1) })}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={s.breakBtn} onPress={() => startBreak()}>
                  <Text style={[s.breakBtnText, { color: C.accent }]}>{store.t('practice.startBreak')}</Text>
                </Pressable>
                <Pressable style={s.breakBtn} onPress={() => setBreaksSeen((n) => n + 1)}>
                  <Text style={s.breakBtnText}>{store.t('practice.skip')}</Text>
                </Pressable>
              </View>
            </View>
          )}
          {breakEnd !== null && (
            <View style={s.breakBanner}>
              <Text style={s.breakText}>{breakOver ? store.t('practice.breakOver') : store.t('practice.onBreak')}</Text>
              {!breakOver && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable hitSlop={8} onPress={() => adjustBreak(-1)}>
                    <Text style={s.breakStep}>−</Text>
                  </Pressable>
                  <Text style={s.breakClock}>
                    {String(Math.floor(breakLeft / 60)).padStart(2, '0')}:{String(breakLeft % 60).padStart(2, '0')}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => adjustBreak(1)}>
                    <Text style={s.breakStep}>+</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={[s.breakBtn, breakOver && { borderColor: C.accent, backgroundColor: C.accentTint }]} onPress={endBreak}>
                <Text style={[s.breakBtnText, breakOver && { color: C.accent }]}>{store.t('practice.resume')}</Text>
              </Pressable>
            </View>
          )}
          {/* which passage the minutes go to (#91) — only when the piece has open spots */}
          {openSpots.length > 0 && (
            <View style={{ marginTop: 22, alignSelf: 'stretch', gap: 8 }}>
              <Overline>{store.t('spots.workingOn')}</Overline>
              <ChipRow>
                <ActionChip icon={() => null} label={store.t('spots.wholePiece')} active={spotId === null} testID="spot-chip-whole" onPress={() => setSpotId(null)} />
                {openSpots.map((sp) => (
                  <ActionChip key={sp.id} icon={() => null} label={sp.label} active={spotId === sp.id} testID={`spot-chip-${sp.id}`} onPress={() => setSpotId(sp.id)} />
                ))}
              </ChipRow>
            </View>
          )}

          {/* the clean-pass ladder (#90). It renders nothing unless the focus is a
              piece with a target tempo and auto-advance switched on for it. */}
          {focusPiece && <LadderTally piece={focusPiece} />}

          {/* what the mic is hearing, while it is hearing it */}
          {recording && (
            <View style={{ marginTop: 28 }}>
              <LiveWaveform active={!recPaused} getLevel={micLevel} onSample={onSample} bars={40} height={30} />
            </View>
          )}
          <View style={s.toolStrip}>
            <ToolCell
              live={recording && !recPaused}
              label={recording ? store.t('practice.stopRecording') : store.t('practice.record')}
              glyph={(color) => <Text style={{ fontFamily: F.body, fontSize: fs(13), color }}>{'●'}</Text>}
              onPress={() => {
                thud(recording); // start is a medium thud, stop answers lighter
                toggleRec();
              }}
            />
            <ToolCell
              divider
              testID="session-metronome"
              label={`${metronome.bpm} ${tempoTerm(metronome.bpm)}`}
              glyph={(color) => <MetNote size={fs(22)} color={color} />}
              onPress={() => {
                tap();
                setMetroOpen(true);
              }}
            />
            <ToolCell
              divider
              label={store.t('tuner.tuner')}
              glyph={(color) => <Text style={{ fontFamily: F.body, fontSize: fs(20), color }}>{'♯'}</Text>}
              onPress={() => router.push('/tuner')}
            />
            <ToolCell
              divider
              disabled={scores.length === 0}
              label={store.t('score.title')}
              glyph={(color) => <Text style={{ fontFamily: F.body, fontSize: fs(19), color }}>{'§'}</Text>}
              onPress={() => {
                tap();
                setScoreOpen(scores[0]);
              }}
            />
          </View>
          {(recording || recPaused) && (
            <Text style={s.toolHint}>
              {store.t('practice.toolStripRecording', { name: focus.name })}
              {' · '}
              <Text style={{ color: C.accent }} onPress={pauseResumeRec}>
                {recPaused ? store.t('practice.resumeTake') : store.t('practice.pauseTake')}
              </Text>
            </Text>
          )}
          {focus.kind === 'Piece' && <ScoreViewer piece={focus.name} start={scoreOpen} onClose={() => setScoreOpen(null)} />}
        </View>
        <View>
          <EntryRow
            top
            keySize={48}
            keyStyle={{ borderWidth: 1.5, borderColor: C.ink, backgroundColor: 'transparent' }}
            keyContent={
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={{ width: 3, height: 14, borderRadius: 1, backgroundColor: C.ink }} />
                <View style={{ width: 3, height: 14, borderRadius: 1, backgroundColor: C.ink }} />
              </View>
            }
            testID="practice-pause"
            title={paused ? store.t('practice.resume') : store.t('practice.pause')}
            subline={breakInMin !== null ? store.t('practice.breakDueIn', { min: breakInMin }) : undefined}
            right={null}
            disabled={breakEnd !== null}
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
            keySize={48}
            keyStyle={{ backgroundColor: C.ink }}
            keyContent={<View style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: C.bg }} />}
            testID="practice-end"
            title={store.t('practice.endSave')}
            subline={store.t('practice.minSoFar', { min: minSoFar })}
            right={null}
            onPress={endSave}
          />
        </View>
        <Pressable
          testID="practice-discard"
          style={{ marginTop: 18, alignSelf: 'center' }}
          hitSlop={8}
          onPress={() => {
            const discard = () => {
              discardTake();
              store.setLiveSession(null);
              setSpotId(null);
              setRunning(false);
              setStartedAt(null);
              setAccum(0);
              setSeconds(0);
              setBreaksSeen(0);
              if (breakEnd !== null) endBreak();
            };
            // ponytail: Alert.alert is a no-op on web; window.confirm covers it
            if (Platform.OS === 'web') {
              if (window.confirm(`${store.t('practice.discardTitle')} ${store.t('practice.discardMessage')}`)) discard();
              return;
            }
            Alert.alert(store.t('practice.discardTitle'), store.t('practice.discardMessage'), [
              { text: store.t('practice.keepPracticing'), style: 'cancel' },
              { text: store.t('practice.discard'), style: 'destructive', onPress: discard },
            ]);
          }}>
          <Text style={s.discard}>{store.t('practice.discardSession')}</Text>
        </Pressable>
        <MetronomeSheet visible={metroOpen} onClose={() => setMetroOpen(false)} />
      </View>
    );
  }

  // a render function, not a component declared inside render: that would be a new
  // component type every render, remounting every row (and reloading its cover) on each tap
  const renderOption = ({ key, name, kind, meta, artwork, height = 60 }: { key: string; name: string; kind: 'Piece' | 'Technique'; meta?: string; artwork?: string; height?: number }) => {
    const sel = focus?.name === name && focus.kind === kind;
    return (
      <Pressable key={key} style={[s.option, { height }]} onPress={() => setFocus({ name, kind })}>
        <View style={[s.optionBar, { height: height - 28, backgroundColor: sel ? C.accent : C.barline, width: sel ? 3 : 1.5 }]} />
        {!!artwork && <Image source={{ uri: artwork }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: C.track }} contentFit="cover" transition={150} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.optionText, sel && { color: C.accent }]} numberOfLines={1}>
            {name}
          </Text>
          {!!meta && (
            <Text style={s.optionMeta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        {sel && <MetNote size={fs(22)} color={C.accent} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAwareScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled" bottomOffset={16}>
        {/* the date was decoration; manual entry earns the slot and stays clear of
            the instrument tabs and the search below it */}
        <View style={s.headRow}>
          <Overline>{store.t('tabs.practice')}</Overline>
          <Pressable style={{ marginLeft: 'auto' }} hitSlop={8} onPress={() => setPastOpen(true)}>
            <Text style={s.manualLink}>{store.t('practice.logPast')}</Text>
          </Pressable>
        </View>
        <Text style={s.title}>{store.t('practice.title')}</Text>
        {/* Instrument first, then the tools, then the search directly above the list
            it filters. Always on screen: picking an instrument with nothing under it
            used to hide the only way back. */}
        {store.instruments.length > 1 && (
          <View style={s.filterRow}>
            <UnderlineTabs
              options={[{ key: '', label: store.t('common.all') }, ...store.instruments.map((i) => ({ key: i, label: i }))]}
              value={inst}
              onChange={(v) => store.updateSettings({ instrumentFilter: v })}
            />
          </View>
        )}
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={store.t('practice.searchPlaceholder')}
          style={{ marginTop: 18, marginBottom: 4 }}
        />
        {/* what the app would practise today, from the signals Progress already has (#95) */}
        {!q && <SuggestedCard />}
        {pieces.length > 0 && (
          <>
            <Overline style={{ marginTop: 32 }}>{store.t('practice.pieces')}</Overline>
            <View style={{ marginTop: 6 }}>
              {pieces.map((p) => (
                renderOption({
                  key: p.id,
                  name: p.name,
                  kind: 'Piece',
                  artwork: p.artwork,
                  // on "All" the instrument is the only thing telling two rows of the
                  // same piece apart, so it joins the subline; inside one instrument
                  // it would just repeat the filter and is left off
                  meta: [p.by, !inst && store.instruments.length > 1 ? instrumentLabel(p) : '', store.stages[p.stage]].filter(Boolean).join(' · '),
                })
              ))}
            </View>
          </>
        )}
        {techniques.length > 0 && (
          <>
            {/* folds away like Repertoire's, and shares the same stored choice */}
            <View style={{ marginTop: 32 }}>
              <SectionHead
                testID="toggle-techniques"
                label={store.t('practice.techniques')}
                open={store.showTechniques}
                onToggle={() => store.updateSettings({ showTechniques: !store.showTechniques })}
              />
            </View>
            <View style={{ marginTop: 6 }}>
              {store.showTechniques &&
                techniques.map((t) => (
                renderOption({
                  key: t.id,
                  name: t.name,
                  kind: 'Technique',
                  height: 52,
                  // same as the piece rows: on "All" the instrument is the only
                  // thing distinguishing two techniques of the same name
                    meta: !inst && store.instruments.length > 1 ? instrumentLabel(t) : undefined,
                  })
                ))}
            </View>
          </>
        )}
        {pieces.length === 0 && techniques.length === 0 && plans.length === 0 && (
          <Text style={s.noMatch}>{store.t('practice.noMatches', { query: query.trim() })}</Text>
        )}
        {!q && (
          <>
            <Overline style={{ marginTop: 32 }}>{store.t('practice.plans')}</Overline>
            <View style={{ marginTop: 6 }}>
              {plans.map((p) => {
                const total = p.segments.reduce((a, x) => a + x.min, 0);
                return (
                  <Pressable key={p.id} style={s.routineRow} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })}>
                    <View style={s.optionBar} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.optionText} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={s.optionMeta}>{store.t('practice.planMeta', { count: p.segments.length, total })}</Text>
                    </View>
                    <ChevronIcon color={C.barline} size={14} />
                  </Pressable>
                );
              })}
              <Pressable
                testID="new-routine"
                style={s.planAdd}
                onPress={() => {
                  const id = store.addPlan(store.t('practice.defaultPlanName'));
                  router.push({ pathname: '/plan/[id]', params: { id } });
                }}>
                <Text style={s.planAddText}>{store.t('practice.newPlan')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
      <View style={{ paddingHorizontal: 24 }}>
        <EntryRow
          keySize={56}
          keyStyle={{ backgroundColor: C.accent }}
          keyContent={<PlayIcon color={C.bg} />}
          testID="start-session"
          title={store.t('practice.startSession')}
          subline={focus ? <Text style={[s.entrySubAccent]}>{focus.name}</Text> : undefined}
          right={null}
          disabled={!focus}
          close
          onPress={() => {
            // ambiguous instrument: ask first, and let the answer start the session
            if (instChoices.length) return setAskInst(true);
            beginSession(null);
          }}
        />
      </View>
      <LogPastModal visible={pastOpen} onClose={() => setPastOpen(false)} />
      <InstrumentAsk
        visible={askInst}
        name={focus?.name ?? ''}
        choices={instChoices}
        onClose={() => setAskInst(false)}
        onPick={(on) => {
          setAskInst(false);
          beginSession(on);
        }}
      />
      <MetronomeSheet visible={metroOpen} onClose={() => setMetroOpen(false)} />
      <SessionReview session={review} onClose={closeReview} onToggleTake={toggleRec} onImportTake={importTakes} recording={recording} />
    </View>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  manualLink: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  filterRow: { marginTop: 14, marginBottom: 6 },
  noMatch: { fontFamily: F.body, fontSize: fs(14), color: C.sub, textAlign: 'center', marginTop: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: C.hairline },
  optionBar: { width: 1.5, height: 32, backgroundColor: C.barline, borderRadius: 1 },
  optionText: { fontFamily: F.bodyMed, fontSize: fs(16), lineHeight: fs(22), color: C.ink },
  optionMeta: { fontFamily: F.body, fontSize: fs(14.5), lineHeight: fs(18), color: C.subStrong },
  routineRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 60, borderBottomWidth: 1, borderBottomColor: C.hairline },
  planAdd: { height: 44, justifyContent: 'center' },
  planAddText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  entrySubAccent: { fontFamily: F.accent, fontSize: fs(16), lineHeight: fs(22), color: C.accent },
  runPage: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  runHeadRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  runStarted: { marginLeft: 'auto', fontFamily: F.body, fontSize: fs(16), color: C.subStrong },
  runCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  runFocus: { fontFamily: F.body, fontSize: fs(20), color: C.subStrong },
  timerRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 },
  timer: { fontFamily: F.head, fontSize: fs(90), color: C.ink, fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  status: { fontFamily: F.bodyMed, fontSize: fs(15) },
  runProgressMeta: { marginTop: 8, width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
  runProgressText: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong },
  breakBanner: { alignItems: 'center', gap: 10, marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignSelf: 'stretch' },
  breakText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink, textAlign: 'center' },
  breakBtn: { height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  breakBtnText: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.ink },
  breakClock: { fontFamily: F.head, fontSize: fs(30), color: C.ink, fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'center' },
  breakStep: { fontSize: fs(24), color: C.sub, paddingHorizontal: 6 },
  toolStrip: { marginTop: 24, flexDirection: 'row', width: '100%', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.staffLine },
  toolCell: { flex: 1, minWidth: 0, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  toolCellDivider: { borderLeftWidth: 1, borderLeftColor: C.staffLine },
  toolGlyphBox: { height: 24, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 0.3 },
  toolHint: { marginTop: 10, textAlign: 'center', fontFamily: F.body, fontSize: fs(11.5), color: C.tertiary },
  discard: { fontFamily: F.body, fontSize: fs(14), color: C.sub, textDecorationLine: 'underline', textDecorationColor: C.sub },
}));
