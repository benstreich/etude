import React, { useEffect, useState } from 'react';
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

type Suggestion = { track: string; artist: string };

export default function Repertoire() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // song/artist suggestions from the iTunes Search API (public, no key)
  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=10`);
        const data = await res.json();
        const seen = new Set<string>();
        const list: Suggestion[] = [];
        for (const r of data.results ?? []) {
          const key = `${r.trackName}`.toLowerCase() + '|' + `${r.artistName}`.toLowerCase();
          if (r.trackName && !seen.has(key)) {
            seen.add(key);
            list.push({ track: r.trackName, artist: r.artistName ?? '' });
          }
          if (list.length >= 5) break;
        }
        if (!stale) setSuggestions(list);
      } catch {
        // offline or blocked — manual entry still works
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [name]);

  const add = (n = name.trim(), by = artist.trim()) => {
    if (!n) return;
    store.addPiece(n, by);
    setName('');
    setArtist('');
    setSuggestions([]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Repertoire</ScreenTitle>

      <View style={s.addRow}>
        <TextInput
          style={[s.input, { flex: 1.4 }]}
          value={name}
          onChangeText={setName}
          placeholder="Add a piece…"
          placeholderTextColor={C.tertiary}
          onSubmitEditing={() => add()}
          returnKeyType="done"
        />
        <TextInput
          style={s.input}
          value={artist}
          onChangeText={setArtist}
          placeholder="Artist"
          placeholderTextColor={C.tertiary}
          onSubmitEditing={() => add()}
          returnKeyType="done"
        />
        <Pressable style={s.plusBtn} onPress={() => add()}>
          <Text style={s.plusText}>+</Text>
        </Pressable>
      </View>

      {suggestions.length > 0 && (
        <Card style={{ paddingVertical: 4, paddingHorizontal: 16, marginTop: -8 }}>
          {suggestions.map((sug, i) => (
            <Pressable
              key={`${sug.track}|${sug.artist}`}
              style={[s.sugRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
              onPress={() => add(sug.track, sug.artist)}>
              <Text style={s.pieceName} numberOfLines={1}>
                {sug.track}
              </Text>
              <Text style={s.composer} numberOfLines={1}>
                {sug.artist}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}

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
  sugRow: { paddingVertical: 10 },
  input: { flex: 1, minWidth: 0, height: 48, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  plusBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.bg, fontSize: 24, lineHeight: 26, fontFamily: F.bodyMed },
  row: { paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pieceName: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  composer: { fontFamily: F.body, fontSize: 12.5, color: C.sub, marginTop: 2 },
  tag: { fontFamily: F.bodySemi, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { fontFamily: F.body, fontSize: 12.5, color: C.tertiary, textAlign: 'center' },
});
