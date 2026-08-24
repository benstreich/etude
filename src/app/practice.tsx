import { RecordingPresets, requestNotificationPermissionsAsync, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogPastModal } from '@/components/log-past';
import { MetronomeButton } from '@/components/metronome';
import { SessionReview, type ReviewSession } from '@/components/session-review';
import { Overline } from '@/components/ui';
import { applyAudioMode, setRecordingFlags } from '@/lib/audio-mode';
import { toStoredUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function Practice() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<{ name: string; kind: 'Piece' | 'Technique' } | null>(null);
  const [running, setRunning] = useState(false);
  // wall-clock based so time keeps counting while the app is backgrounded
  const [startedAt, setStartedAt] = useState<number | null>(null); // null = paused
  const [accum, setAccum] = useState(0); // seconds banked across pauses
  const [seconds, setSeconds] = useState(0);
  const [pastOpen, setPastOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ReviewSession | null>(null); // saved session shown in the review moment
  const sessionStart = useRef(0); // wall clock when the session was started
  const paused = startedAt === null;
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
  const pieces = store.pieces.filter(
    (p) => p.stage < store.stages.length - 1 && !p.archived && p.name.toLowerCase().includes(q)
  );
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
    return (
      <View style={[s.runPage, { paddingTop: insets.top }]}>
        <Overline style={{ textAlign: 'center' }}>{focus.name}</Overline>
        <Text style={s.timer} numberOfLines={1} adjustsFontSizeToFit>
          {mm}:{ss}
        </Text>
        <Text style={[s.status, paused ? { color: C.sub } : { color: C.accent }]}>{paused ? store.t('practice.paused') : store.t('practice.running')}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[s.recBtn, recording && !recPaused && s.recBtnOn]} onPress={toggleRec}>
            <View style={[s.recDot, recording && !recPaused && { backgroundColor: C.bg }]} />
            <Text style={[s.recText, recording && !recPaused && { color: C.bg }]}>
              {recording ? store.t('practice.stopRecording') : store.t('practice.record')}
            </Text>
          </Pressable>
          {recording && (
            <Pressable style={s.recBtn} onPress={pauseResumeRec}>
              <Text style={s.recText}>{recPaused ? store.t('practice.resume') : store.t('practice.pause')}</Text>
            </Pressable>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <MetronomeButton compact />
        </View>
        <View style={s.runBtns}>
          <Pressable
            style={s.outlineBtn}
            onPress={() => {
              if (paused) setStartedAt(Date.now());
              else {
                setAccum(seconds);
                setStartedAt(null);
              }
            }}>
            <Text style={s.outlineBtnText}>{paused ? store.t('practice.resume') : store.t('practice.pause')}</Text>
          </Pressable>
          <Pressable style={s.darkBtn} onPress={endSave}>
            <Text style={s.darkBtnText}>{store.t('practice.endSave')}</Text>
          </Pressable>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => {
            const discard = () => {
              if (recording) {
                setRecording(false);
                setRecPaused(false);
                setRecordingFlags({});
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
      </View>
    );
  }

  const Option = ({ name, kind }: { name: string; kind: 'Piece' | 'Technique' }) => {
    const sel = focus?.name === name;
    return (
      <Pressable
        style={[s.option, sel && { borderColor: C.accent, backgroundColor: C.accentTint }]}
        onPress={() => setFocus({ name, kind })}>
        <Text style={[s.optionText, sel && { color: C.accent }]}>{name}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
        <View style={s.titleRow}>
          <Text style={s.title}>{store.t('practice.title')}</Text>
          <MetronomeButton compact />
        </View>
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder={store.t('practice.searchPlaceholder')}
          placeholderTextColor={C.tertiary}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {pieces.length > 0 && (
          <>
            <Overline style={{ marginBottom: 10 }}>{store.t('practice.pieces')}</Overline>
            <View style={s.group}>
              {pieces.map((p) => (
                <Option key={p.id} name={p.name} kind="Piece" />
              ))}
            </View>
          </>
        )}
        {techniques.length > 0 && (
          <>
            <Overline style={{ marginBottom: 10, marginTop: pieces.length > 0 ? 22 : 0 }}>{store.t('practice.techniques')}</Overline>
            <View style={s.group}>
              {techniques.map((t) => (
                <Option key={t} name={t} kind="Technique" />
              ))}
            </View>
          </>
        )}
        {pieces.length === 0 && techniques.length === 0 && plans.length === 0 && (
          <Text style={s.noMatch}>{store.t('practice.noMatches', { query: query.trim() })}</Text>
        )}
        {!q && (
          <>
            <Overline style={{ marginBottom: 10, marginTop: pieces.length + techniques.length > 0 ? 22 : 0 }}>
              {store.t('practice.plans')}
            </Overline>
            <View style={s.group}>
              {plans.map((p) => {
                const total = p.segments.reduce((a, x) => a + x.min, 0);
                return (
                  <Pressable key={p.id} style={s.option} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })}>
                    <Text style={s.optionText}>{p.name}</Text>
                    <Text style={s.planMeta}>
                      {store.t('practice.planMeta', { count: p.segments.length, total })}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
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
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <Pressable
          style={[s.startBtn, !focus && { opacity: 0.4 }]}
          disabled={!focus}
          onPress={() => {
            setSeconds(0);
            setAccum(0);
            sessionStart.current = Date.now();
            setStartedAt(Date.now());
            setRunning(true);
          }}>
          <Text style={s.startBtnText}>{store.t('practice.startSession')}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setPastOpen(true)}>
          <Text style={s.pastLink}>{store.t('practice.logPastLink')}</Text>
        </Pressable>
      </View>
      <LogPastModal visible={pastOpen} onClose={() => setPastOpen(false)} />
      <SessionReview session={review} onClose={closeReview} onToggleTake={toggleRec} recording={recording} />
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: F.head, fontSize: fs(30), color: C.ink, marginBottom: 26, lineHeight: fs(37) },
  group: { gap: 10 },
  search: { height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, paddingHorizontal: 14, fontFamily: F.body, fontSize: fs(15), color: C.ink, marginBottom: 18 },
  noMatch: { fontFamily: F.body, fontSize: fs(14), color: C.sub, textAlign: 'center', marginTop: 8 },
  option: { height: 52, borderRadius: r(14), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, justifyContent: 'center', paddingHorizontal: 16 },
  optionText: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  planMeta: { fontFamily: F.body, fontSize: fs(12), color: C.sub, marginTop: 1 },
  planAdd: { height: 50, borderRadius: r(14), borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.chartInactive, alignItems: 'center', justifyContent: 'center' },
  planAddText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  startBtn: { height: 60, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontFamily: F.bodySemi, fontSize: fs(17), color: C.bg },
  pastLink: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub, marginTop: 14, textAlign: 'center', textDecorationLine: 'underline' },
  runPage: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  timer: { fontFamily: F.head, fontSize: fs(88), color: C.ink, fontVariant: ['tabular-nums'], marginVertical: 8 },
  status: { fontFamily: F.bodyMed, fontSize: fs(15) },
  runBtns: { flexDirection: 'row', gap: 12, marginTop: 16, alignSelf: 'stretch' },
  recBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 18, borderRadius: r(999), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, marginTop: 32 },
  recBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  recDot: { width: 8, height: 8, borderRadius: r(4), backgroundColor: C.accent },
  recText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  discard: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub, marginTop: 24, textDecorationLine: 'underline' },
  outlineBtn: { flex: 1, height: 56, borderRadius: r(14), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink },
  darkBtn: { flex: 1, height: 56, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  darkBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
