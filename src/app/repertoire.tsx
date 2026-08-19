import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchIcon } from '@/components/icons';
import { RecordingsList } from '@/components/recordings';
import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { dayLabel, Piece, useStore } from '@/lib/store';
import { C, F } from '@/lib/theme';

// last stage green, next-to-last accent, the rest muted
const stageColor = (i: number, n: number) => (i >= n - 1 ? C.success : i === n - 2 ? C.accent : C.sub);

type Suggestion = { track: string; artist: string };

const PRESET_TECHNIQUES = [
  'Scales & arpeggios',
  'Sight reading',
  'Ear training',
  'Improvisation',
  'Rhythm & metronome',
  'Chords & voicings',
  'Finger exercises',
  'Music theory',
];

export default function Repertoire() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [menuPiece, setMenuPiece] = useState<Piece | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customTech, setCustomTech] = useState('');

  const closeAdd = () => {
    setAddOpen(false);
    setName('');
    setCreating(null);
    setSuggestions([]);
    setCustomTech('');
  };

  const addTech = (t: string) => {
    if (!t.trim()) return;
    if (store.techniques.includes(t)) store.removeTechnique(t);
    else store.addTechnique(t.trim());
  };

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
    setAddOpen(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ScreenTitle>Repertoire</ScreenTitle>
        <Pressable style={s.fabBtn} onPress={() => setAddOpen(true)}>
          <Text style={s.fabText}>+</Text>
        </Pressable>
      </View>

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
                <Text style={[s.tag, { color: stageColor(p.stage, store.stages.length) }]}>
                  {store.stages[Math.min(p.stage, store.stages.length - 1)]}
                </Text>
                <Pressable style={s.moreBtn} hitSlop={8} onPress={() => setMenuPiece(p)}>
                  <Text style={s.moreText}>⋯</Text>
                </Pressable>
              </View>
              <Bar pct={p.pct} color={p.stage >= store.stages.length - 1 ? C.success : C.ink} />
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

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <Pressable style={s.backdrop} onPress={closeAdd}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Add to repertoire</Text>
            <Overline style={{ marginBottom: 10 }}>Song</Overline>
            {creating === null ? (
              <>
                <View style={s.searchWrap}>
                  <SearchIcon color={C.tertiary} />
                  <TextInput
                    style={s.searchInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Search songs & artists…"
                    placeholderTextColor={C.tertiary}
                    onSubmitEditing={() => name.trim() && setCreating(name.trim())}
                    returnKeyType="done"
                  />
                  {name.length > 0 && (
                    <Pressable hitSlop={8} onPress={() => setName('')}>
                      <Text style={s.clearText}>×</Text>
                    </Pressable>
                  )}
                </View>
                {name.trim().length > 0 && (
                  <View style={{ paddingHorizontal: 4 }}>
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
                  </View>
                )}
              </>
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
            <Overline style={{ marginTop: 18, marginBottom: 10 }}>Techniques — tap to add or remove</Overline>
            <View style={s.chipWrap}>
              {[...new Set([...PRESET_TECHNIQUES, ...store.techniques])].map((t) => {
                const sel = store.techniques.includes(t);
                return (
                  <Pressable key={t} style={[s.chip, sel && s.chipSel]} onPress={() => addTech(t)}>
                    <Text style={[s.chipText, sel && { color: C.accent }]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.addRow}>
              <TextInput
                style={s.input}
                value={customTech}
                onChangeText={setCustomTech}
                placeholder="Your own technique…"
                placeholderTextColor={C.tertiary}
                onSubmitEditing={() => {
                  addTech(customTech);
                  setCustomTech('');
                }}
                returnKeyType="done"
              />
              <Pressable
                style={s.plusBtn}
                onPress={() => {
                  addTech(customTech);
                  setCustomTech('');
                }}>
                <Text style={s.plusText}>+</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuPiece !== null} transparent animationType="fade" onRequestClose={() => setMenuPiece(null)}>
        <Pressable style={s.backdrop} onPress={() => setMenuPiece(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {menuPiece && (
              <>
                <Text style={s.sheetTitle}>{menuPiece.name}</Text>
                <RecordingsList recordings={store.recordings.filter((r) => r.piece === menuPiece.name)} />
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: 999,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingHorizontal: 18,
    shadowColor: '#1c1a17',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  clearText: { fontSize: 20, color: C.faint, lineHeight: 22 },
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
  moreText: { fontSize: 18, color: C.faint, lineHeight: 28, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink, marginBottom: 8 },
  sheetRow: { height: 52, justifyContent: 'center' },
  fabBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: C.bg, fontSize: 26, lineHeight: 28, fontFamily: F.bodyMed },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { height: 38, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: 13, color: C.ink },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: 16, color: C.ink },
});
