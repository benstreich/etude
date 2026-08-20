import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoteIcon, SearchIcon } from '@/components/icons';
import { RecordingsList } from '@/components/recordings';
import { Bar, Card, Overline, ScreenTitle } from '@/components/ui';
import { dayLabel, Piece, useStore } from '@/lib/store';
import { F, themed, useC, type Palette, type T } from '@/lib/theme';

// last stage green, next-to-last accent, the rest muted
const stageColor = (C: Palette, i: number, n: number) => (i >= n - 1 ? C.success : i === n - 2 ? C.accent : C.sub);

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
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [menuPiece, setMenuPiece] = useState<Piece | null>(null);
  const [openRecs, setOpenRecs] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customTech, setCustomTech] = useState('');
  const winH = useWindowDimensions().height;

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
    if (q.length < 3) return;
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

  // derived instead of cleared in the effect — stale entries just stop rendering
  const shown = name.trim().length >= 3 ? suggestions : [];

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

      {active.length === 0 ? (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 8 }}>
            <View style={s.emptyTile}>
              <NoteIcon size={26} color={C.accent} />
            </View>
            <Text style={s.emptyTitle}>What are you working on?</Text>
            <Text style={s.emptyText}>Add the piece you’re learning — search fills in the artist for you.</Text>
            <Pressable style={s.emptyBtn} onPress={() => setAddOpen(true)}>
              <Text style={s.emptyBtnText}>Add a piece</Text>
            </Pressable>
          </Card>
          <View style={{ gap: 12 }}>
            <Overline>Or start with a technique</Overline>
            <View style={s.chipWrap}>
              {PRESET_TECHNIQUES.filter((t) => !store.techniques.includes(t)).slice(0, 6).map((t) => (
                <Pressable key={t} style={s.chip} onPress={() => store.addTechnique(t)}>
                  <Text style={s.chipText}>
                    <Text style={{ color: C.accent }}>+ </Text>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : (
      <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
        {active.map((p, i) => {
          const st = stats(p);
          const recs = store.recordings.filter((r) => r.piece === p.name);
          return (
            <Pressable
              key={p.id}
              style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
              onPress={() => router.push(`/piece/${p.id}`)}>
              <View style={s.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pieceName}>{p.name}</Text>
                  {!!p.by && <Text style={s.composer}>{p.by}</Text>}
                  {st.min > 0 && st.last && (
                    <Text style={s.invested}>
                      {st.min} min invested · last {dayLabel(st.last, store.today)}
                    </Text>
                  )}
                </View>
                <Text style={[s.tag, { color: stageColor(C, p.stage, store.stages.length) }]}>
                  {store.stages[Math.min(p.stage, store.stages.length - 1)]}
                </Text>
                <Pressable style={s.moreBtn} hitSlop={8} onPress={() => setMenuPiece(p)}>
                  <Text style={s.moreText}>⋯</Text>
                </Pressable>
              </View>
              <Bar pct={p.pct} color={p.stage >= store.stages.length - 1 ? C.success : C.ink} />
              {recs.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setOpenRecs(openRecs === p.id ? null : p.id)}>
                  <Text style={s.recsToggle}>
                    {openRecs === p.id ? '▾' : '▸'} {recs.length} recording{recs.length > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              )}
              {openRecs === p.id && <RecordingsList recordings={recs} />}
            </Pressable>
          );
        })}
      </Card>
      )}

      {active.length > 0 && <Text style={s.hint}>Tap a piece for details, stats & recordings</Text>}

      {/* ponytail: recordings made on a technique focus have no piece row — surface them here */}
      {(() => {
        const names = new Set(store.pieces.map((p) => p.name));
        const orphans = store.recordings.filter((r) => !names.has(r.piece));
        return orphans.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Overline>Technique recordings</Overline>
            <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
              <RecordingsList recordings={orphans} showPiece />
            </Card>
          </View>
        ) : null;
      })()}

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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          <Pressable style={[s.sheet, { maxHeight: winH * 0.6 }]} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                    {shown.map((sug, i) => (
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
                      style={[s.sugRow, shown.length > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
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
            {name.trim().length === 0 && creating === null && (
            <>
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
            </>
            )}
            </ScrollView>
          </Pressable>
          </KeyboardAvoidingView>
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

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 20 },
  addRow: { flexDirection: 'row', gap: 8 },
  sugRow: { paddingVertical: 10 },
  createText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  creatingLabel: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    borderRadius: r(999),
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
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  clearText: { fontSize: fs(20), color: C.faint, lineHeight: fs(22) },
  input: { flex: 1, minWidth: 0, height: 48, borderRadius: r(12), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  plusBtn: { width: 48, height: 48, borderRadius: r(12), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.bg, fontSize: fs(24), lineHeight: fs(26), fontFamily: F.bodyMed },
  row: { paddingVertical: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pieceName: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  composer: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 2 },
  tag: { fontFamily: F.bodySemi, fontSize: fs(11.5), letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, textAlign: 'center' },
  invested: { fontFamily: F.body, fontSize: fs(12), color: C.tertiary, marginTop: 3 },
  recsToggle: { fontFamily: F.bodyMed, fontSize: fs(12.5), color: C.sub, marginTop: 10 },
  moreBtn: { width: 28, height: 28, borderRadius: r(14), alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  moreText: { fontSize: fs(18), color: C.faint, lineHeight: fs(28), textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink, marginBottom: 8 },
  sheetRow: { height: 52, justifyContent: 'center' },
  fabBtn: { width: 50, height: 50, borderRadius: r(25), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: C.bg, fontSize: fs(26), lineHeight: fs(28), fontFamily: F.bodyMed },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  emptyTile: { width: 52, height: 52, borderRadius: r(16), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: F.head, fontSize: fs(16), color: C.ink },
  emptyText: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(20), color: C.sub, maxWidth: 260, textAlign: 'center' },
  emptyBtn: { height: 44, paddingHorizontal: 20, borderRadius: r(12), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  emptyBtnText: { fontFamily: F.bodySemi, fontSize: fs(14.5), color: '#FFFFFF' },
  chip: { height: 38, paddingHorizontal: 13, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.ink },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
}));
