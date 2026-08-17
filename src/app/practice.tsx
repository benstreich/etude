import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overline } from '@/components/ui';
import { useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [text, setText] = useState('');
  return (
    <TextInput
      style={s.addRow}
      value={text}
      onChangeText={setText}
      placeholder={placeholder}
      placeholderTextColor={C.tertiary}
      returnKeyType="done"
      onSubmitEditing={() => {
        const n = text.trim();
        if (n) onAdd(n);
        setText('');
      }}
    />
  );
}

export default function Practice() {
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<{ name: string; kind: 'Piece' | 'Technique' } | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running || paused) return;
    const t = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running, paused]);

  const pieces = store.pieces.filter((p) => p.status !== 'Ready');

  const endSave = () => {
    if (!focus) return;
    const min = Math.max(1, Math.round(seconds / 60));
    store.logMinutes(min, focus.name, `Today · ${focus.kind}`);
    store.showToast(`Session saved — ${min} min of ${focus.name}`);
    setRunning(false);
    setPaused(false);
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
        <View style={s.runBtns}>
          <Pressable style={s.outlineBtn} onPress={() => setPaused((p) => !p)}>
            <Text style={s.outlineBtnText}>{paused ? 'Resume' : 'Pause'}</Text>
          </Pressable>
          <Pressable style={s.darkBtn} onPress={endSave}>
            <Text style={s.darkBtnText}>End & save</Text>
          </Pressable>
        </View>
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
          <AddRow placeholder="+ Add a piece…" onAdd={store.addPiece} />
        </View>
        <Overline style={{ marginBottom: 10, marginTop: 22 }}>Techniques</Overline>
        <View style={s.group}>
          {store.techniques.map((t) => (
            <Option key={t} name={t} kind="Technique" />
          ))}
          <AddRow placeholder="+ Add a technique…" onAdd={store.addTechnique} />
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <Pressable
          style={[s.startBtn, !focus && { opacity: 0.4 }]}
          disabled={!focus}
          onPress={() => {
            setSeconds(0);
            setPaused(false);
            setRunning(true);
          }}>
          <Text style={s.startBtnText}>Start session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  title: { fontFamily: F.head, fontSize: 30, color: C.ink, marginBottom: 26, lineHeight: 37 },
  group: { gap: 10 },
  option: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, justifyContent: 'center', paddingHorizontal: 16 },
  optionText: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  addRow: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, borderStyle: 'dashed', paddingHorizontal: 16, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  startBtn: { height: 60, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontFamily: F.bodySemi, fontSize: 17, color: C.bg },
  runPage: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  timer: { fontFamily: F.head, fontSize: 88, color: C.ink, fontVariant: ['tabular-nums'], marginVertical: 8 },
  status: { fontFamily: F.bodyMed, fontSize: 15 },
  runBtns: { flexDirection: 'row', gap: 12, marginTop: 40, alignSelf: 'stretch' },
  outlineBtn: { flex: 1, height: 56, borderRadius: 14, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.ink },
  darkBtn: { flex: 1, height: 56, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  darkBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },
});
