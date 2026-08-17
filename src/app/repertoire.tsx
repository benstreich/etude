import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { dayLabel, Piece, PieceStatus, useStore } from '@/lib/store';
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
  const [creating, setCreating] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [menuPiece, setMenuPiece] = useState<Piece | null>(null);

  const active = store.pieces.filter((p) => !p.archived);
  const archived = store.pieces.filter((p) => p.archived);

  // invested time per piece from the session log (matched by title)
  const stats = (p: Piece) => {
    let min = 0;
    let last: string | null = null;
    for (const sess of store.sessions) {
      if (sess.title === p.name) {
        min += sess.min;
        if (!last || sess.date > last) last = sess.date;
      }
    }
    return { min, last };
  };

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

  const add = (n: string, by: string) => {
    if (!n) return;
    store.addPiece(n, by);
    setName('');
    setArtist('');
    setCreating(null);
    setSuggestions([]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Repertoire</ScreenTitle>

      {creating === null ? (
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Search songs & artists…"
          placeholderTextColor={C.tertiary}
          onSubmitEditing={() => name.trim() && setCreating(name.trim())}
          returnKeyType="done"
        />
      ) : (
        <View>
          <Text style={s.creatingLabel}>Adding “{creating}”</Text>
          <View style={s.addRow}>
            <TextInput
              style={s.input}
              value={artist}
              onChangeText={setArtist}
              placeholder="Artist (optional)"
              placeholderTextColor={C.tertiary}
              autoFocus
              onSubmitEditing={() => add(creating, artist.trim())}
              returnKeyType="done"
            />
            <Pressable style={s.plusBtn} onPress={() => add(creating, artist.trim())}>
              <Text style={s.plusText}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      {creating === null && name.trim().length > 0 && (
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
          <Pressable
            style={[s.sugRow, suggestions.length > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
            onPress={() => setCreating(name.trim())}>
            <Text style={s.createText}>+ Create “{name.trim()}”</Text>
          </Pressable>
        </Card>
      )}

      <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
        {active.map((p, i) => {
          const st = stats(p);
          return (
            <Pressable
              key={p.id}
              style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
              onPress={() => store.cyclePiece(p.id)}>
              <View style={s.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pieceName}>{p.name}</Text>
                  {!!p.by && <Text style={s.composer}>{p.by}</Text>}
                  {st.min > 0 && st.last && (
                    <Text style={s.invested}>
                      {st.min} min invested · last {dayLabel(st.last)}
                    </Text>
                  )}
                </View>
                <Text style={[s.tag, { color: statusColor[p.status] }]}>{p.status}</Text>
                <Pressable style={s.moreBtn} hitSlop={8} onPress={() => setMenuPiece(p)}>
                  <Text style={s.moreText}>⋯</Text>
                </Pressable>
              </View>
              <Bar pct={p.pct} color={p.status === 'Ready' ? C.success : C.ink} />
            </Pressable>
          );
        })}
      </Card>

      <Text style={s.hint}>Tap a piece to advance its status</Text>

      {archived.length > 0 && (
        <View style={{ gap: 12 }}>
          <Overline>Archived</Overline>
          <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
            {archived.map((p, i) => (
              <Pressable
                key={p.id}
                style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
                onPress={() => setMenuPiece(p)}>
                <View style={s.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pieceName, { color: C.sub }]}>{p.name}</Text>
                    {!!p.by && <Text style={s.composer}>{p.by}</Text>}
                  </View>
                  <Text style={s.moreText}>⋯</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </View>
      )}

      <Modal visible={menuPiece !== null} transparent animationType="fade" onRequestClose={() => setMenuPiece(null)}>
        <Pressable style={s.backdrop} onPress={() => setMenuPiece(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {menuPiece && (
              <>
                <Text style={s.sheetTitle}>{menuPiece.name}</Text>
                <Pressable
                  style={s.sheetRow}
                  onPress={() => {
                    store.setArchived(menuPiece.id, !menuPiece.archived);
                    setMenuPiece(null);
                  }}>
                  <Text style={s.sheetRowText}>{menuPiece.archived ? 'Restore to repertoire' : 'Archive'}</Text>
                </Pressable>
                <Pressable
                  style={s.sheetRow}
                  onPress={() => {
                    store.removePiece(menuPiece.id);
                    setMenuPiece(null);
                  }}>
                  <Text style={[s.sheetRowText, { color: C.accent }]}>Remove</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 20 },
  addRow: { flexDirection: 'row', gap: 8 },
  sugRow: { paddingVertical: 10 },
  createText: { fontFamily: F.bodySemi, fontSize: 14, color: C.accent },
  creatingLabel: { fontFamily: F.bodyMed, fontSize: 13, color: C.sub, marginBottom: 8 },
  input: { flex: 1, minWidth: 0, height: 48, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  plusBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.bg, fontSize: 24, lineHeight: 26, fontFamily: F.bodyMed },
  row: { paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pieceName: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  composer: { fontFamily: F.body, fontSize: 12.5, color: C.sub, marginTop: 2 },
  tag: { fontFamily: F.bodySemi, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { fontFamily: F.body, fontSize: 12.5, color: C.tertiary, textAlign: 'center' },
  invested: { fontFamily: F.body, fontSize: 12, color: C.tertiary, marginTop: 3 },
  moreBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  moreText: { fontSize: 18, color: C.faint, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink, marginBottom: 8 },
  sheetRow: { height: 52, justifyContent: 'center' },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: 16, color: C.ink },
});
