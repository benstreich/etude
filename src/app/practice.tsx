import { RecordingPresets, requestNotificationPermissionsAsync, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { File } from 'expo-file-system';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon, PlayIcon, SearchIcon } from '@/components/icons';
import { LogPastModal } from '@/components/log-past';
import { MetronomeSheet } from '@/components/metronome';
import { LiveWaveform, NoteTempo, RollingNumber, StaffProgress } from '@/components/motifs';
import { ScorePill } from '@/components/score';
import { SessionReview, type ReviewSession } from '@/components/session-review';
import { Text } from '@/components/text';
import { EntryRow, Overline, useInstrumentFilter } from '@/components/ui';
import { applyAudioMode, setRecordingFlags } from '@/lib/audio-mode';
import { useMetronome } from '@/lib/metronome';
import { cancelBreakEnd, scheduleBreakEnd } from '@/lib/reminders';
import { Piece, toStoredUri, useStore } from '@/lib/store';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

export default function Practice() {
  const s = useS();
  const C = useC();
  const { fs } = useTheme();
  const store = useStore();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const metronome = useMetronome();
  const [focus, setFocus] = useState<{ name: string; kind: 'Piece' | 'Technique' } | null>(null);
  const [running, setRunning] = useState(false);
  // the staff nav (StaffNav in _layout.tsx) reads this to hide itself while a session runs
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: running ? { display: 'none' } : undefined });
  }, [running, navigation]);
  // wall-clock based so time keeps counting while the app is backgrounded
  const [startedAt, setStartedAt] = useState<number | null>(null); // null = paused
  const [accum, setAccum] = useState(0); // seconds banked across pauses
  const [seconds, setSeconds] = useState(0);
  const [pastOpen, setPastOpen] = useState(false);
  const [metroOpen, setMetroOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ReviewSession | null>(null); // saved session shown in the review moment
  const sessionStart = useRef(0); // wall clock when the session was started
  const [startClock, setStartClock] = useState(0); // same instant, mirrored to state so the header can read it during render
  const paused = startedAt === null;
  const inst = useInstrumentFilter();
  // practice breaks (#59): the reminder fires each time the timer crosses another
  // `breakEvery` interval; a break pauses the session timer and counts down separately
  const [breaksSeen, setBreaksSeen] = useState(0); // intervals already answered (started or skipped)
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
  const jsStop = useRef(false); // a JS-initiated stop; mutes the status listener below
  const finishRef = useRef<() => void>(() => {});
  // directory: 'document' so recordings survive cache cleanup; 48kHz/256kbps AAC (~2MB/min)
  // The status listener catches stops we didn't ask for — the foreground-service
  // notification's Stop button, an interruption, a recorder error — and finalizes
  // instead of letting the UI keep "recording" a recorder that's already dead.
  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      sampleRate: 48000,
      bitRate: 256000,
      isMeteringEnabled: true,
      directory: 'document',
    },
    (st) => {
      if (st.isFinished && !jsStop.current) finishRef.current();
    }
  );
  const [recording, setRecording] = useState(false);
  const [recPaused, setRecPaused] = useState(false);
  const recStart = useRef(0); // start of the current un-paused segment
  const recAccumMs = useRef(0); // recorded ms banked across pauses
  const waveRef = useRef<number[]>([]);

  // the same dBFS → 0..1 mapping the saved waveform uses, read live by LiveWaveform
  const micLevel = useCallback(
    () => Math.min(1, Math.max(0.05, ((recorder.getStatus().metering ?? -50) + 50) / 50)),
    [recorder],
  );

  // sample mic level 5×/s for the waveform; dBFS -50..0 → 0..1
  useEffect(() => {
    if (!recording || recPaused) return;
    const t = setInterval(() => {
      const db = recorder.getStatus().metering ?? -50;
      waveRef.current.push(Math.min(1, Math.max(0.06, (db + 50) / 50)));
    }, 200);
    return () => clearInterval(t);
  }, [recording, recPaused, recorder]);

  const pauseResumeRec = () => {
    if (recPaused) {
      recorder.record();
      recStart.current = Date.now();
    } else {
      recorder.pause();
      recAccumMs.current += Date.now() - recStart.current;
    }
    setRecPaused((p) => !p);
  };

  // shared finalize; stopNative=false when the recorder already stopped on its own
  // and there is nothing left to stop — just bank what was recorded so far
  const endRec = async (stopNative: boolean) => {
    const totalMs = recAccumMs.current + (recPaused ? 0 : Date.now() - recStart.current);
    setRecording(false);
    setRecPaused(false);
    setRecordingFlags({});
    if (stopNative) {
      jsStop.current = true;
      try {
        await recorder.stop();
      } catch {}
      jsStop.current = false;
    }
    // leave record mode — Android otherwise stays in communication routing, which
    // mutes Bluetooth A2DP and plays the metronome at call volume
    applyAudioMode({ playsInSilentMode: true });
    // downsample the level samples to ≤60 bars
    const raw = waveRef.current;
    waveRef.current = [];
    const N = 60;
    const wave =
      raw.length <= N
        ? raw
        : Array.from({ length: N }, (_, i) => {
            const a = Math.floor((i * raw.length) / N);
            const b = Math.max(a + 1, Math.floor(((i + 1) * raw.length) / N));
            return raw.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
          });
    if (recorder.uri && focus)
      store.addRecording(
        focus.name,
        toStoredUri(recorder.uri),
        Math.round(totalMs / 1000),
        wave.map((v) => Math.round(v * 100) / 100)
      );
  };

  useEffect(() => {
    finishRef.current = () => {
      if (recording) endRec(false);
    };
  });

  const toggleRec = async () => {
    if (recording) return endRec(true);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return store.showToast(store.t('practice.micPermissionNeeded'));
    try {
      // Android 13+: background recording runs a foreground service, which needs
      // notification permission or prepare throws. Denied → record foreground-only.
      // Expo Go's manifest lacks the service entirely (start silently fails and the
      // recorder dies), so background recording needs a dev build.
      const isExpoGo = Constants.appOwnership === 'expo';
      const canBackground =
        Platform.OS !== 'android' || (!isExpoGo && (await requestNotificationPermissionsAsync()).granted);
      // allowsBackgroundRecording keeps the mic running when the app is backgrounded;
      // the flags are registered so metronome/playback audio-mode calls can't clobber them
      setRecordingFlags({ allowsRecording: true, allowsBackgroundRecording: canBackground });
      await applyAudioMode({
        playsInSilentMode: true,
        shouldPlayInBackground: true, // don't cut off a metronome already running in the background
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setRecordingFlags({});
      applyAudioMode({ playsInSilentMode: true }); // undo record-mode routing (see endRec)
      return store.showToast(store.t('practice.recordStartFailed'));
    }
    recStart.current = Date.now();
    recAccumMs.current = 0;
    setRecording(true);
  };

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setSeconds(accum + Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, startedAt, accum]);

  const q = query.trim().toLowerCase();
  // every piece in the repertoire is practisable — reaching the last stage used
  // to hide it here, which just looked like the piece had gone missing (#41).
  // Finished ones sort last so "what are you working on" still reads right.
  const finished = (p: Piece) => p.stage >= store.stages.length - 1;
  const pieces = store.pieces
    .filter((p) => !p.archived && p.name.toLowerCase().includes(q) && (!inst || !p.instrument || p.instrument === inst))
    .sort((a, b) => Number(finished(a)) - Number(finished(b)));
  const techniques = store.techniques.filter((t) => t.toLowerCase().includes(q));
  const plans = store.plans.filter((p) => p.name.toLowerCase().includes(q));

  const endSave = async () => {
    if (!focus) return;
    if (recording) await toggleRec();
    const min = Math.max(1, Math.round(seconds / 60));
    const id = store.logMinutes(min, focus.name, focus.kind);
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
    if (recording) await endRec(true); // an attached take still running gets banked
    setReview(null);
    setFocus(null);
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
            {!paused && <View style={s.statusDot} />}
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
          {/* what the mic is hearing, while it is hearing it */}
          {recording && (
            <View style={{ marginTop: 28 }}>
              <LiveWaveform active={!recPaused} getLevel={micLevel} />
            </View>
          )}
          <View style={s.runToolsRow}>
            <Pressable style={[s.recPill, recording && !recPaused && s.recPillOn]} onPress={toggleRec}>
              <View style={[s.recDot, recording && !recPaused && { backgroundColor: C.bg }]} />
              <Text style={[s.recText, recording && !recPaused && { color: C.bg }]}>
                {recording ? store.t('practice.stopRecording') : store.t('practice.record')}
              </Text>
            </Pressable>
            {recording && (
              <Pressable onPress={pauseResumeRec}>
                <Text style={s.toolLink}>{recPaused ? store.t('practice.resume') : store.t('practice.pause')}</Text>
              </Pressable>
            )}
            <Text style={s.toolSep}>|</Text>
            <Pressable onPress={() => setMetroOpen(true)}>
              <NoteTempo bpm={metronome.bpm} active={metronome.running} />
            </Pressable>
            <Text style={s.toolSep}>|</Text>
            <Pressable onPress={() => router.push('/tuner')}>
              <Text style={s.toolLink}>{store.t('tuner.tuner')}</Text>
            </Pressable>
            {focus.kind === 'Piece' && <ScorePill piece={focus.name} />}
          </View>
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
            title={store.t('practice.endSave')}
            subline={store.t('practice.minSoFar', { min: minSoFar })}
            right={null}
            onPress={endSave}
          />
        </View>
        <Pressable
          style={{ marginTop: 18, alignSelf: 'center' }}
          hitSlop={8}
          onPress={() => {
            const discard = () => {
              if (recording) {
                setRecording(false);
                setRecPaused(false);
                setRecordingFlags({});
                applyAudioMode({ playsInSilentMode: true }); // undo record-mode routing (see endRec)
                jsStop.current = true;
                // delete the take — document-dir files the store never references leak forever
                recorder
                  .stop()
                  .then(() => {
                    try {
                      if (recorder.uri) new File(recorder.uri).delete();
                    } catch {}
                  })
                  .catch(() => {})
                  .finally(() => {
                    jsStop.current = false;
                  });
                waveRef.current = [];
              }
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
        {sel && <Text style={s.optionNote}>{'\u{1D15F}'}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAwareScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled" bottomOffset={16}>
        <View style={s.headRow}>
          <Overline>{store.t('tabs.practice')}</Overline>
          <Text style={s.headDate}>{new Date(store.now).toLocaleDateString(store.lang, { weekday: 'short', day: 'numeric', month: 'long' })}</Text>
        </View>
        <Text style={s.title}>{store.t('practice.title')}</Text>
        <View style={s.searchRow}>
          <SearchIcon size={18} color={C.tertiary} />
          <TextInput
            style={s.search}
            value={query}
            onChangeText={setQuery}
            placeholder={store.t('practice.searchPlaceholder')}
            placeholderTextColor={C.tertiary}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <View style={s.toolsRow}>
          <Pressable onPress={() => setPastOpen(true)}>
            <Text style={s.toolLinkInk}>{store.t('practice.logPast')}</Text>
          </Pressable>
          <Text style={s.toolSep}>|</Text>
          <Pressable onPress={() => setMetroOpen(true)}>
            <NoteTempo bpm={metronome.bpm} active={metronome.running} />
          </Pressable>
          <Text style={s.toolSep}>|</Text>
          <Pressable onPress={() => router.push('/tuner')}>
            <Text style={s.toolLinkInk}>{store.t('tuner.tuner')}</Text>
          </Pressable>
        </View>
        {pieces.length > 0 && (
          <>
            <View style={[s.overlineRow, { marginTop: 32 }]}>
              <Overline>{store.t('practice.pieces')}</Overline>
              {store.instruments.length > 1 && (
                <Text style={s.instFilter}>
                  {['', ...store.instruments].map((option, i) => {
                    const sel = option === inst;
                    return (
                      <Text key={option || 'all'}>
                        {i > 0 && ' · '}
                        <Text onPress={() => store.updateSettings({ instrumentFilter: option })} style={sel ? { color: C.subStrong } : undefined}>
                          {option || store.t('common.all')}
                        </Text>
                      </Text>
                    );
                  })}
                </Text>
              )}
            </View>
            <View style={{ marginTop: 6 }}>
              {pieces.map((p) => (
                renderOption({ key: p.id, name: p.name, kind: 'Piece', artwork: p.artwork, meta: [p.by, store.stages[p.stage]].filter(Boolean).join(' · ') })
              ))}
            </View>
          </>
        )}
        {techniques.length > 0 && (
          <>
            <Overline style={{ marginTop: 32 }}>{store.t('practice.techniques')}</Overline>
            <View style={{ marginTop: 6 }}>
              {techniques.map((t) => (
                renderOption({ key: t, name: t, kind: 'Technique', height: 52 })
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
            setSeconds(0);
            setAccum(0);
            sessionStart.current = Date.now();
            setStartClock(sessionStart.current);
            setBreaksSeen(0);
            setStartedAt(Date.now());
            setRunning(true);
          }}
        />
      </View>
      <LogPastModal visible={pastOpen} onClose={() => setPastOpen(false)} />
      <MetronomeSheet visible={metroOpen} onClose={() => setMetroOpen(false)} />
      <SessionReview session={review} onClose={closeReview} onToggleTake={toggleRec} recording={recording} />
    </View>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  headDate: { marginLeft: 'auto', fontFamily: F.body, fontSize: fs(16), color: C.subStrong },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  searchRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderBottomWidth: 1, borderBottomColor: C.staffLine },
  search: { flex: 1, fontFamily: F.body, fontSize: fs(17), color: C.ink },
  toolsRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  toolLinkInk: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  toolSep: { fontSize: fs(14), color: C.staffLine },
  overlineRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  instFilter: { fontFamily: F.body, fontSize: fs(13), color: C.tertiary },
  noMatch: { fontFamily: F.body, fontSize: fs(14), color: C.sub, textAlign: 'center', marginTop: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: C.hairline },
  optionBar: { width: 1.5, height: 32, backgroundColor: C.barline, borderRadius: 1 },
  optionText: { fontFamily: F.bodyMed, fontSize: fs(16), lineHeight: fs(22), color: C.ink },
  optionMeta: { fontFamily: F.body, fontSize: fs(14.5), lineHeight: fs(18), color: C.subStrong },
  optionNote: { fontFamily: F.notation, fontSize: fs(22), lineHeight: fs(22), color: C.accent },
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
  // wraps: with a recording pause link and a score pill in play, one line runs off a phone
  runToolsRow: { marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, rowGap: 10 },
  recPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.track },
  recPillOn: { backgroundColor: C.accent, borderColor: C.accent },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  recText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  toolLink: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  discard: { fontFamily: F.body, fontSize: fs(14), color: C.sub, textDecorationLine: 'underline', textDecorationColor: C.sub },
}));
