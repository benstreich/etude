import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogPastModal } from '@/components/log-past';
import { Overline } from '@/components/ui';
import { useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

export default function Practice() {
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
  const paused = startedAt === null;
  // directory: 'document' so recordings survive cache cleanup; 48kHz/256kbps AAC (~2MB/min)
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    sampleRate: 48000,
    bitRate: 256000,
    isMeteringEnabled: true,
    directory: 'document',
  });
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

  const toggleRec = async () => {
    if (recording) {
      const totalMs = recAccumMs.current + (recPaused ? 0 : Date.now() - recStart.current);
      setRecording(false);
      setRecPaused(false);
      await recorder.stop();
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
          recorder.uri,
          Math.round(totalMs / 1000),
          wave.map((v) => Math.round(v * 100) / 100)
        );
      return;
    }
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return store.showToast('Microphone permission needed');
    // allowsBackgroundRecording keeps the mic running when the app is backgrounded
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
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

  const pieces = store.pieces.filter((p) => p.stage < store.stages.length - 1 && !p.archived);

  const endSave = async () => {
    if (!focus) return;
    if (recording) await toggleRec();
    const min = Math.max(1, Math.round(seconds / 60));
    store.logMinutes(min, focus.name, focus.kind);
    store.showToast(`Session saved — ${min} min of ${focus.name}`);
    setRunning(false);
    setStartedAt(null);
    setAccum(0);
    setSeconds(0);
    setFocus(null);
    router.push('/');
  };

  if (running && focus) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return (
      <View style={[s.runPage, { paddingTop: insets.top }]}>
        <Overline style={{ textAlign: 'center' }}>{focus.name}</Overline>
        <Text style={s.timer}>
          {mm}:{ss}
        </Text>
        <Text style={[s.status, paused ? { color: C.sub } : { color: C.accent }]}>{paused ? 'Paused' : 'Recording'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[s.recBtn, recording && !recPaused && s.recBtnOn]} onPress={toggleRec}>
            <View style={[s.recDot, recording && !recPaused && { backgroundColor: C.bg }]} />
            <Text style={[s.recText, recording && !recPaused && { color: C.bg }]}>
              {recording ? 'Stop recording' : 'Record'}
            </Text>
          </Pressable>
          {recording && (
            <Pressable style={s.recBtn} onPress={pauseResumeRec}>
              <Text style={s.recText}>{recPaused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
          )}
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
            <Text style={s.outlineBtnText}>{paused ? 'Resume' : 'Pause'}</Text>
          </Pressable>
          <Pressable style={s.darkBtn} onPress={endSave}>
            <Text style={s.darkBtnText}>End & save</Text>
          </Pressable>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => {
            const discard = () => {
              if (recording) {
                setRecording(false);
                setRecPaused(false);
                recorder.stop();
                waveRef.current = [];
              }
              setRunning(false);
              setStartedAt(null);
              setAccum(0);
              setSeconds(0);
            };
            // ponytail: Alert.alert is a no-op on web; window.confirm covers it
            if (Platform.OS === 'web') {
              if (window.confirm('Discard session? This practice time won’t be saved.')) discard();
              return;
            }
            Alert.alert('Discard session?', 'This practice time won’t be saved.', [
              { text: 'Keep practicing', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: discard },
            ]);
          }}>
          <Text style={s.discard}>Discard session</Text>
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
        <Text style={s.title}>What are you{'\n'}working on?</Text>
        <Overline style={{ marginBottom: 10 }}>Pieces</Overline>
        <View style={s.group}>
          {pieces.map((p) => (
            <Option key={p.id} name={p.name} kind="Piece" />
          ))}
        </View>
        <Overline style={{ marginBottom: 10, marginTop: 22 }}>Techniques</Overline>
        <View style={s.group}>
          {store.techniques.map((t) => (
            <Option key={t} name={t} kind="Technique" />
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <Pressable
          style={[s.startBtn, !focus && { opacity: 0.4 }]}
          disabled={!focus}
          onPress={() => {
            setSeconds(0);
            setAccum(0);
            setStartedAt(Date.now());
            setRunning(true);
          }}>
          <Text style={s.startBtnText}>Start session</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setPastOpen(true)}>
          <Text style={s.pastLink}>Forgot a day? Log past practice</Text>
        </Pressable>
      </View>
      <LogPastModal visible={pastOpen} onClose={() => setPastOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  title: { fontFamily: F.head, fontSize: 30, color: C.ink, marginBottom: 26, lineHeight: 37 },
  group: { gap: 10 },
  option: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, justifyContent: 'center', paddingHorizontal: 16 },
  optionText: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  startBtn: { height: 60, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontFamily: F.bodySemi, fontSize: 17, color: C.bg },
  pastLink: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub, marginTop: 14, textAlign: 'center', textDecorationLine: 'underline' },
  runPage: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  timer: { fontFamily: F.head, fontSize: 88, color: C.ink, fontVariant: ['tabular-nums'], marginVertical: 8 },
  status: { fontFamily: F.bodyMed, fontSize: 15 },
  runBtns: { flexDirection: 'row', gap: 12, marginTop: 16, alignSelf: 'stretch' },
  recBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, marginTop: 32 },
  recBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  recText: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink },
  discard: { fontFamily: F.bodyMed, fontSize: 14, color: C.sub, marginTop: 24, textDecorationLine: 'underline' },
  outlineBtn: { flex: 1, height: 56, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink },
  darkBtn: { flex: 1, height: 56, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  darkBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },
});
