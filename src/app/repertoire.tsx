import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bar, Card, ScreenTitle } from '@/components/ui';
import { PieceStatus, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

const statusColor: Record<PieceStatus, string> = {
  Learning: C.sub,
  Polishing: C.accent,
  Ready: C.success,
};

export default function Repertoire() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');

  const add = () => {
    const n = name.trim();
    if (!n) return;
    store.addPiece(n);
    setName('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Repertoire</ScreenTitle>

      <View style={s.addRow}>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Add a piece…"
          placeholderTextColor={C.tertiary}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable style={s.plusBtn} onPress={add}>
          <Text style={s.plusText}>+</Text>
        </Pressable>
      </View>

      <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
        {store.pieces.map((p, i) => (
          <Pressable
            key={p.id}
            style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
            onPress={() => store.cyclePiece(p.id)}>
            <View style={s.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.pieceName}>{p.name}</Text>
                {!!p.by && <Text style={s.composer}>{p.by}</Text>}
              </View>
              <Text style={[s.tag, { color: statusColor[p.status] }]}>{p.status}</Text>
            </View>
            <Bar pct={p.pct} color={p.status === 'Ready' ? C.success : C.ink} />
          </Pressable>
        ))}
      </Card>

      <Text style={s.hint}>Tap a piece to advance its status</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 20 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 48, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  plusBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.bg, fontSize: 24, lineHeight: 26, fontFamily: F.bodyMed },
  row: { paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pieceName: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  composer: { fontFamily: F.body, fontSize: 12.5, color: C.sub, marginTop: 2 },
  tag: { fontFamily: F.bodySemi, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { fontFamily: F.body, fontSize: 12.5, color: C.tertiary, textAlign: 'center' },
});
