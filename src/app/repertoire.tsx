import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoteIcon, SearchIcon } from '@/components/icons';
import { MeasureBar } from '@/components/motifs';
import { RecordingsList } from '@/components/recordings';
import { Text } from '@/components/text';
import { Card, Overline, SearchField, SectionHead, Sheet, stageColor, UnderlineTabs, useInstrumentFilter } from '@/components/ui';
import { groupByFolder, MAX_FOLDER_NAME, MAX_FOLDERS } from '@/lib/folder-math';
import { onInstrument, pieceInstruments, toggleInstrument } from '@/lib/instrument-math';
import { staleness } from '@/lib/stats-math';
import { dayLabel, Piece, Recording, useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

type Suggestion = { track: string; artist: string; artwork?: string };

// iTunes hands back a 100px cover; the same CDN serves any square size by renaming the file
const coverUrl = (u: unknown) => (typeof u === 'string' ? u.replace(/\/\d+x\d+bb\./, '/300x300bb.') : undefined);

/** Album cover for a row, or the note tile when the piece has none. */
function Cover({ uri, size = 44 }: { uri?: string; size?: number }) {
  const C = useC();
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8, backgroundColor: C.track }} contentFit="cover" transition={150} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' }}>
      <NoteIcon size={size * 0.45} color={C.tertiary} />
    </View>
  );
}

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
  // tagged with the query they answer, so a result for an older query neither
  // shows nor counts as this query's answer (#38)
  const [suggestions, setSuggestions] = useState<{ q: string; list: Suggestion[] }>({ q: '', list: [] });
  const [menuPiece, setMenuPiece] = useState<Piece | null>(null);
  const [moveTake, setMoveTake] = useState<Recording | null>(null); // orphaned take being re-homed
  const [listQuery, setListQuery] = useState(''); // searches the repertoire itself, not the add sheet
  const [addOpen, setAddOpen] = useState(false);
  const [customTech, setCustomTech] = useState('');
  // #102. `newFolder` null = the inline field in the piece sheet is closed; '' = open and empty.
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null); // the folder being managed
  const [renameDraft, setRenameDraft] = useState('');

  const closeAdd = () => {
    setAddOpen(false);
    setName('');
    setCreating(null);
    setSuggestions({ q: '', list: [] });
    setCustomTech('');
  };

  const addTech = (t: string) => {
    if (!t.trim()) return;
    if (store.techniques.includes(t)) store.removeTechnique(t);
    else store.addTechnique(t.trim());
  };

  const { reduceMotion } = useTheme();

  // A folder is created from the piece sheet and the piece goes straight into it —
  // making an empty folder and then filing something into it is two trips for one
  // intention. An invalid name keeps the sheet open (profile.tsx's save rule: never
  // a false save), so the half-typed name is still there to fix.
  const createFolder = (p: Piece) => {
    const name = (newFolder ?? '').trim();
    if (!store.addFolder(name)) return store.showToast(store.t('repertoire.errFolder'));
    store.setPieceFolder(p.id, name);
    setMenuPiece({ ...p, folder: name });
    setNewFolder(null);
  };
  const closeMenu = () => {
    setMenuPiece(null);
    setNewFolder(null);
  };
  const openFolderMenu = (folder: string) => {
    setRenameDraft(folder);
    setFolderMenu(folder);
  };
  const saveRename = () => {
    if (folderMenu === null) return;
    if (renameDraft.trim() === folderMenu) return setFolderMenu(null); // unchanged
    if (!store.renameFolder(folderMenu, renameDraft)) return store.showToast(store.t('repertoire.errFolder'));
    setFolderMenu(null);
  };
  const confirmDeleteFolder = (folder: string) => {
    Alert.alert(store.t('repertoire.deleteFolder'), store.t('repertoire.deleteFolderBody'), [
      { text: store.t('recordings.moveCancel'), style: 'cancel' },
      {
        text: store.t('repertoire.deleteFolder'),
        style: 'destructive',
        onPress: () => {
          store.removeFolder(folder);
          setFolderMenu(null);
        },
      },
    ]);
  };

  const inst = useInstrumentFilter();
  const [addInst, setAddInst] = useState<string | null>(null); // instrument for the piece being added; null = primary
  // untagged pieces show under every instrument (#58)
  const listQ = listQuery.trim().toLowerCase();
  const matches = (p: Piece) => p.name.toLowerCase().includes(listQ) || (p.by ?? '').toLowerCase().includes(listQ);
  const active = store.pieces.filter((p) => !p.archived && onInstrument(p, inst) && matches(p));
  // #83: techniques are pieces of kind 'Technique' — same rows, same detail page
  const techniques = store.allPieces.filter((p) => p.kind === 'Technique' && !p.archived && onInstrument(p, inst) && matches(p));
  const archived = store.allPieces.filter((p) => p.archived);
  // "add your first piece" is about an empty repertoire, not an empty result: a
  // search or an instrument tab that matches nothing is a filter to clear, and
  // telling someone with forty pieces that they have none is a lie either way.
  const filtering = listQ.length > 0 || !!inst;
  const clearFilters = () => {
    setListQuery('');
    if (inst) store.updateSettings({ instrumentFilter: '' });
  };

  // invested time from the session log, matched by title — pieces and
  // techniques are both logged under their display name
  const investedIn = (name: string) => {
    let min = 0;
    let last: string | null = null;
    for (const sess of store.sessions) {
      if (sess.title === name) {
        min += sess.min;
        if (!last || sess.date > last) last = sess.date;
      }
    }
    return { min, last };
  };
  const stats = (p: Piece) => investedIn(p.name);
  const stale = (p: Piece) => staleness(store.sessions.filter((x) => x.title === p.name).map((x) => x.date), store.today);

  // song/artist suggestions from the iTunes Search API (public, no key)
  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) return;
    let stale = false;
    const t = setTimeout(async () => {
      let list: Suggestion[] = [];
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=10`);
        const data = await res.json();
        const seen = new Set<string>();
        for (const r of data.results ?? []) {
          const key = `${r.trackName}`.toLowerCase() + '|' + `${r.artistName}`.toLowerCase();
          if (r.trackName && !seen.has(key)) {
            seen.add(key);
            list.push({ track: r.trackName, artist: r.artistName ?? '', artwork: coverUrl(r.artworkUrl100) });
          }
          if (list.length >= 5) break;
        }
      } catch {
        // offline or blocked — manual entry still works, and an empty answer
        // still has to be recorded or the spinner below would never stop
      }
      if (!stale) setSuggestions({ q, list });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [name]);

  // backfill covers for pieces added before artwork existed: `undefined` = never looked,
  // '' = looked and found nothing, so every piece is queried once per install (offline
  // failures leave it undefined and try again next visit)
  useEffect(() => {
    const todo = store.pieces.filter((p) => p.kind !== 'Technique' && p.artwork === undefined);
    if (todo.length === 0) return;
    let stop = false;
    (async () => {
      for (const p of todo) {
        if (stop) return;
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${p.name} ${p.by}`.trim())}&entity=song&limit=1`);
          const data = await res.json();
          if (!stop) store.updatePiece(p.id, { artwork: coverUrl(data.results?.[0]?.artworkUrl100) ?? '' });
        } catch {
          // offline — leave undefined, retried next time
        }
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount; the list it reads is a snapshot on purpose
  }, []);

  // derived instead of cleared in the effect — stale entries just stop rendering
  const shown = suggestions.q === name.trim() ? suggestions.list : [];
  const searching = name.trim().length >= 3 && suggestions.q !== name.trim();

  const add = (n: string, by: string, artwork?: string) => {
    if (!n) return;
    store.addPiece(n, by, addInst ?? (inst || undefined), artwork);
    setAddInst(null);
    setName('');
    setArtist('');
    setCreating(null);
    setSuggestions({ q: '', list: [] });
    setAddOpen(false);
  };

  // one row for pieces and techniques alike; recordings and scores live on the page (#84)
  const renderRow = (p: Piece, i: number) => {
    const st = stats(p);
    const n = store.stages.length;
    const dueNote = p.stage >= n - 1 && stale(p)?.due ? store.t('repertoire.dueForReview', { days: stale(p)!.daysSince }) : '';
    return (
      <Animated.View key={p.id} layout={LinearTransition.duration(260)} exiting={FadeOut.duration(180)}>
        <Pressable
          style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
          onPress={() => router.push(`/piece/${p.id}`)}
          onLongPress={() => setMenuPiece(p)}>
          <View style={s.rowTop}>
            <Cover uri={p.artwork} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pieceName} numberOfLines={1}>
                {p.name}
              </Text>
              {!!p.by && <Text style={s.composer}>{p.by}</Text>}
            </View>
            {p.stage >= 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.tag, { color: stageColor(C, p.stage, n) }]}>{store.stages[Math.min(p.stage, n - 1)]}</Text>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                  {store.stages.map((_, k) => (
                    <View key={k} style={[s.dot, { backgroundColor: k <= p.stage ? stageColor(C, p.stage, n) : C.track }]} />
                  ))}
                </View>
              </View>
            )}
          </View>
          {p.stage >= 0 && (
            <View style={{ marginTop: 12 }}>
              <MeasureBar segments={store.stages.map(() => 1)} done={p.pct / 100} color={stageColor(C, p.stage, n)} />
            </View>
          )}
          <View style={s.rowMeta}>
            <Text style={s.metaText}>
              {st.min > 0 && st.last ? store.t('repertoire.invested', { min: st.min, day: dayLabel(st.last, store.today, store.t, store.lang) }) : ''}
            </Text>
            {!!dueNote && <Text style={[s.metaNote, { color: C.accent }]}>{dueNote}</Text>}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <View style={s.headRow}>
        <Overline>{store.t('tabs.repertoire')}</Overline>
        <Text style={s.headMeta}>
          {store.t('repertoire.piecesCount', { count: active.length })} · {store.t('repertoire.techniquesCount', { count: techniques.length })}
        </Text>
      </View>
      <View style={s.titleRow}>
        <Text style={s.title}>{store.t('tabs.repertoire')}</Text>
        <Pressable testID="repertoire-add" style={s.fabBtn} onPress={() => setAddOpen(true)}>
          <Text style={s.fabText}>+</Text>
        </Pressable>
      </View>
      {/* instrument first, search directly above the list — same order as Practice */}
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
        value={listQuery}
        onChangeText={setListQuery}
        placeholder={store.t('repertoire.searchList')}
        style={{ marginTop: 14, marginBottom: 4 }}
      />

      {active.length === 0 && filtering ? (
        // nothing matched the search or the instrument tab. Techniques are filtered
        // by the same rule, so this only speaks up when they came back empty too.
        techniques.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            <Text style={s.emptyTitle}>{store.t('repertoire.noMatchesTitle')}</Text>
            <Text style={s.emptyText}>{store.t('repertoire.noMatchesText')}</Text>
            <Pressable style={s.emptyBtn} onPress={clearFilters}>
              <Text style={s.emptyBtnText}>{store.t('repertoire.clearFilters')}</Text>
            </Pressable>
          </View>
        )
      ) : active.length === 0 ? (
        <>
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            <View style={s.emptyTile}>
              <NoteIcon size={26} color={C.accent} />
            </View>
            <Text style={s.emptyTitle}>{store.t('repertoire.emptyTitle')}</Text>
            <Text style={s.emptyText}>{store.t('repertoire.emptyText')}</Text>
            <Pressable style={s.emptyBtn} onPress={() => setAddOpen(true)}>
              <Text style={s.emptyBtnText}>{store.t('repertoire.addAPiece')}</Text>
            </Pressable>
          </View>
          <View style={{ gap: 12 }}>
            <Overline>{store.t('repertoire.orStartTechnique')}</Overline>
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
      ) : store.folders.length > 0 && !listQ ? (
        // Folders are a fold over the already-filtered list, never a second copy of
        // it — so the instrument tab applies first and a folder it empties stays on
        // screen at count 0 rather than disappearing. Search wins over folders
        // outright (the `!listQ` above): a match must never hide inside a collapsed
        // group, so any query renders the flat list exactly as it did before #102.
        <View style={{ gap: 6 }}>
          {groupByFolder(active, store.folders).map((sec, si) => {
            if (sec.folder === null && sec.pieces.length === 0) return null;
            // '' is the ungrouped section's collapse key — validFolderName rejects a
            // blank name, so no real folder can ever collide with it
            const key = sec.folder ?? '';
            const open = !store.collapsedFolders.includes(key);
            return (
              <View key={si} style={{ gap: 6 }}>
                <View style={s.folderHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <SectionHead
                      label={`${sec.folder ?? store.t('repertoire.ungrouped')} · ${sec.pieces.length}`}
                      open={open}
                      onToggle={() => store.toggleFolderCollapsed(key)}
                    />
                  </View>
                  {sec.folder !== null && (
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel={store.t('repertoire.folderOptions')}
                      onPress={() => openFolderMenu(sec.folder!)}>
                      <Text style={s.moreText}>⋯</Text>
                    </Pressable>
                  )}
                </View>
                {open && (
                  <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(260)}>
                    {sec.pieces.map(renderRow)}
                  </Animated.View>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View>{active.map(renderRow)}</View>
      )}

      {active.length > 0 && <Text style={s.hint}>{store.t('repertoire.tapHint')}</Text>}

      {/* Techniques are pieces of kind 'Technique' (#83): same rows, same detail page with
          stages, tempo ladder, recordings and scores. Collapsible, and the choice sticks (#45). */}
      {techniques.length > 0 && (
        <View style={{ gap: 6 }}>
          <SectionHead
            label={store.t('repertoire.techniques')}
            open={store.showTechniques}
            onToggle={() => store.updateSettings({ showTechniques: !store.showTechniques })}
          />
          {store.showTechniques && (
            <View>
              {techniques.map((p, i) => (
                <Pressable key={p.id} style={[s.techRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]} onPress={() => router.push(`/piece/${p.id}`)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.pieceName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {/* never practised has no "last" day to name — the piece rows
                        above take the same branch, so keep the two reading alike */}
                    <Text style={s.techMeta}>
                      {stats(p).min > 0 && stats(p).last
                        ? store.t('repertoire.invested', { min: stats(p).min, day: dayLabel(stats(p).last!, store.today, store.t, store.lang) })
                        : store.t('repertoire.notPractisedYet')}
                    </Text>
                  </View>
                  {p.stage >= 0 && <Text style={[s.stageWord, { color: stageColor(C, p.stage, store.stages.length) }]}>{store.stages[Math.min(p.stage, store.stages.length - 1)]}</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* recordings whose focus has since been deleted have no page to live on —
          surface them here, and let them be re-homed onto a piece that still exists */}
      {(() => {
        const names = new Set(store.allPieces.map((p) => p.name));
        const orphans = store.recordings.filter((r) => !names.has(r.piece));
        return orphans.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Overline>{store.t('repertoire.techniqueRecordings')}</Overline>
            <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
              <RecordingsList recordings={orphans} showPiece onMove={setMoveTake} />
            </Card>
          </View>
        ) : null;
      })()}

      {archived.length > 0 && (
        <View style={{ gap: 12 }}>
          <Overline>{store.t('repertoire.archived')}</Overline>
          <View>
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
          </View>
        </View>
      )}

      <Sheet visible={addOpen} onClose={closeAdd} fill style={s.sheet} contentStyle={{ gap: 4 }}>
            <Text style={s.sheetTitle}>{store.t('repertoire.addToRepertoire')}</Text>
            <Overline style={{ marginBottom: 10 }}>{store.t('repertoire.song')}</Overline>
            {creating === null ? (
              <>
                <View style={s.searchWrap}>
                  <SearchIcon color={C.tertiary} />
                  <TextInput
                    testID="add-name-input"
                    style={s.searchInput}
                    value={name}
                    onChangeText={setName}
                    placeholder={store.t('repertoire.searchPlaceholder')}
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
                    {searching && shown.length === 0 && (
                      <View style={s.sugRow}>
                        <ActivityIndicator size="small" color={C.tertiary} />
                      </View>
                    )}
                    {shown.map((sug, i) => (
                      <Pressable
                        key={`${sug.track}|${sug.artist}`}
                        style={[s.sugRow, { flexDirection: 'row', alignItems: 'center', gap: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
                        onPress={() => add(sug.track, sug.artist, sug.artwork)}>
                        <Cover uri={sug.artwork} size={40} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.pieceName} numberOfLines={1}>
                            {sug.track}
                          </Text>
                          <Text style={s.composer} numberOfLines={1}>
                            {sug.artist}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                    <Pressable
                      testID="add-create"
                      style={[s.sugRow, shown.length > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
                      onPress={() => setCreating(name.trim())}>
                      <Text style={s.createText}>{store.t('repertoire.createNamed', { name: name.trim() })}</Text>
                    </Pressable>
                  </View>
                )}
              </>
            ) : (
              <View>
                <Text style={s.creatingLabel}>{store.t('repertoire.addingNamed', { name: creating })}</Text>
                {store.instruments.length > 1 && (
                  <View style={[s.chipWrap, { marginBottom: 10 }]}>
                    {store.instruments.map((i) => {
                      const sel = (addInst ?? inst ?? '') === i || (!addInst && !inst && i === store.instruments[0]);
                      return (
                        <Pressable key={i} style={[s.chip, sel && s.chipSel]} onPress={() => setAddInst(i)}>
                          <Text style={[s.chipText, sel && { color: C.accent }]}>{i}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <View style={s.addRow}>
                  <TextInput
                    style={s.input}
                    value={artist}
                    onChangeText={setArtist}
                    placeholder={store.t('repertoire.artistOptional')}
                    placeholderTextColor={C.tertiary}
                    autoFocus
                    onSubmitEditing={() => add(creating, artist.trim())}
                    returnKeyType="done"
                  />
                  <Pressable testID="add-confirm" style={s.plusBtn} onPress={() => add(creating, artist.trim())}>
                    <Text style={s.plusText}>+</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {name.trim().length === 0 && creating === null && (
            <>
            <Overline style={{ marginTop: 18, marginBottom: 10 }}>{store.t('repertoire.techniquesTapToggle')}</Overline>
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
                placeholder={store.t('repertoire.ownTechniquePlaceholder')}
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
      </Sheet>

      {/* re-home an orphaned take: recordings join pieces by name, so this is a one-field write */}
      <Modal visible={moveTake !== null} transparent animationType="fade" onRequestClose={() => setMoveTake(null)}>
        <Pressable style={s.backdrop} onPress={() => setMoveTake(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{store.t('recordings.moveTitle')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {store.allPieces.map((p) => (
                <Pressable
                  key={p.id}
                  style={s.moveRow}
                  onPress={() => {
                    if (moveTake) store.moveRecording(moveTake.id, p.name);
                    setMoveTake(null);
                  }}>
                  <Text style={s.moveName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {!!p.by && (
                    <Text style={s.moveBy} numberOfLines={1}>
                      {p.by}
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.moveCancel} onPress={() => setMoveTake(null)}>
              <Text style={s.moveCancelText}>{store.t('recordings.moveCancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* A Sheet, not a bare Modal: the "new folder" field sits at the bottom of
          this menu, and a bottom-anchored Modal stays put under the keyboard while
          the Sheet lifts itself clear of it (see useKeyboardLift in ui.tsx). */}
      <Sheet visible={menuPiece !== null} onClose={closeMenu} style={s.sheet}>
            {menuPiece && (
              <>
                <Text style={s.sheetTitle}>{menuPiece.name}</Text>
                {/* a piece is often played on more than one instrument, so these are
                    checkboxes, not a radio group. None ticked = every instrument. */}
                {store.instruments.length > 1 && (
                  <>
                    <View style={[s.chipWrap, { paddingVertical: 10 }]}>
                      {store.instruments.map((i) => {
                        const sel = pieceInstruments(menuPiece).includes(i);
                        return (
                          <Pressable
                            key={i}
                            style={[s.chip, sel && s.chipSel]}
                            onPress={() => {
                              const patch = toggleInstrument(menuPiece, i);
                              store.updatePiece(menuPiece.id, patch);
                              setMenuPiece({ ...menuPiece, ...patch });
                            }}>
                            <Text style={[s.chipText, sel && { color: C.accent }]}>{i}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={s.instHint}>
                      {pieceInstruments(menuPiece).length === 0
                        ? store.t('repertoire.instrumentsAll')
                        : store.t('repertoire.instrumentsHint')}
                    </Text>
                  </>
                )}
                {/* Folders are for live pieces: archived ones have their own section and
                    techniques have theirs, and neither is grouped (#102). */}
                {!menuPiece.archived && menuPiece.kind !== 'Technique' && (
                  <>
                    <Text style={s.instHint}>{store.t('repertoire.moveToFolder')}</Text>
                    <View style={[s.chipWrap, { paddingVertical: 10 }]}>
                      {store.folders.map((f) => {
                        const sel = menuPiece.folder === f;
                        return (
                          <Pressable
                            key={f}
                            style={[s.chip, sel && s.chipSel]}
                            onPress={() => {
                              store.setPieceFolder(menuPiece.id, sel ? null : f);
                              setMenuPiece({ ...menuPiece, folder: sel ? undefined : f });
                            }}>
                            <Text style={[s.chipText, sel && { color: C.accent }]}>{f}</Text>
                          </Pressable>
                        );
                      })}
                      {!!menuPiece.folder && (
                        <Pressable
                          style={s.chip}
                          onPress={() => {
                            store.setPieceFolder(menuPiece.id, null);
                            setMenuPiece({ ...menuPiece, folder: undefined });
                          }}>
                          <Text style={s.chipText}>{store.t('repertoire.noFolder')}</Text>
                        </Pressable>
                      )}
                      {store.folders.length < MAX_FOLDERS && newFolder === null && (
                        <Pressable style={s.chip} onPress={() => setNewFolder('')}>
                          <Text style={[s.chipText, { color: C.accent }]}>
                            <Text style={{ color: C.accent }}>+ </Text>
                            {store.t('repertoire.newFolder')}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {newFolder !== null && (
                      <View style={[s.addRow, { paddingBottom: 10 }]}>
                        <TextInput
                          style={s.input}
                          value={newFolder}
                          onChangeText={setNewFolder}
                          maxLength={MAX_FOLDER_NAME}
                          placeholder={store.t('repertoire.newFolder')}
                          placeholderTextColor={C.faint}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => createFolder(menuPiece)}
                        />
                        <Pressable
                          style={s.plusBtn}
                          accessibilityLabel={store.t('repertoire.saveFolder')}
                          onPress={() => createFolder(menuPiece)}>
                          <Text style={s.fabText}>+</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
                <Pressable
                  style={s.sheetRow}
                  onPress={() => {
                    store.setArchived(menuPiece.id, !menuPiece.archived);
                    closeMenu();
                  }}>
                  <Text style={s.sheetRowText}>{menuPiece.archived ? store.t('repertoire.restore') : store.t('repertoire.archive')}</Text>
                </Pressable>
                <Pressable
                  style={s.sheetRow}
                  onPress={() => {
                    store.removePiece(menuPiece.id);
                    closeMenu();
                  }}>
                  <Text style={[s.sheetRowText, { color: C.accent }]}>{store.t('repertoire.remove')}</Text>
                </Pressable>
              </>
            )}
      </Sheet>

      {/* Rename or drop one folder. Delete is the destructive one, so it confirms and
          says plainly that the pieces survive it — only the grouping goes (#102).
          Same reason as above for the Sheet: the rename field must stay visible
          while it is being typed into. */}
      <Sheet visible={folderMenu !== null} onClose={() => setFolderMenu(null)} style={s.sheet}>
            {folderMenu !== null && (
              <>
                <Text style={s.sheetTitle}>{folderMenu}</Text>
                <Text style={s.instHint}>{store.t('repertoire.renameFolder')}</Text>
                <View style={[s.addRow, { paddingVertical: 10 }]}>
                  <TextInput
                    style={s.input}
                    value={renameDraft}
                    onChangeText={setRenameDraft}
                    maxLength={MAX_FOLDER_NAME}
                    placeholderTextColor={C.faint}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={saveRename}
                  />
                  <Pressable style={s.plusBtn} accessibilityLabel={store.t('repertoire.saveFolder')} onPress={saveRename}>
                    <Text style={s.fabText}>+</Text>
                  </Pressable>
                </View>
                <Pressable style={s.sheetRow} onPress={() => confirmDeleteFolder(folderMenu)}>
                  <Text style={[s.sheetRowText, { color: C.accent }]}>{store.t('repertoire.deleteFolder')}</Text>
                </Pressable>
              </>
            )}
      </Sheet>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 20 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  sugRow: { paddingVertical: 10 },
  createText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  creatingLabel: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  // a ruled field, like Practice's search: a line under the text, no box
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderBottomWidth: 1, borderBottomColor: C.staffLine },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontFamily: F.body, fontSize: fs(16), color: C.ink },
  clearText: { fontSize: fs(20), color: C.faint, lineHeight: fs(22) },
  input: { flex: 1, minWidth: 0, height: 44, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.body, fontSize: fs(15), color: C.ink },
  plusBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: C.ink, fontSize: fs(22), lineHeight: fs(24), fontFamily: F.body },
  headRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  headMeta: { marginLeft: 'auto', fontFamily: F.body, fontSize: fs(16), color: C.subStrong },
  titleRow: { marginTop: 28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: { fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.hairline },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pieceName: { fontFamily: F.bodyMed, fontSize: fs(17), lineHeight: fs(22), color: C.ink },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60 },
  techMeta: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong },
  stageWord: { fontFamily: F.body, fontSize: fs(15) },
  composer: { fontFamily: F.body, fontSize: fs(15), lineHeight: fs(20), color: C.subStrong, marginTop: 1 },
  tag: { fontFamily: F.body, fontSize: fs(15), lineHeight: fs(22) },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  rowMeta: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong },
  metaNote: { fontFamily: F.accent, fontSize: fs(13) },
  hint: { fontFamily: F.body, fontSize: fs(14.5), color: C.tertiary, textAlign: 'center' },
  techHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreBtn: { width: 28, height: 28, borderRadius: r(14), alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  moreText: { fontSize: fs(18), color: C.faint, lineHeight: fs(28), textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40 },
  instHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginBottom: 4 },
  filterRow: { marginTop: 6, marginBottom: 4 },
  moveRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.hairline },
  moveName: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  moveBy: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  moveCancel: { alignItems: 'center', paddingTop: 18 },
  moveCancelText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  sheetTitle: { fontFamily: F.head, fontSize: fs(26), letterSpacing: -0.3, color: C.ink, marginBottom: 12 },
  sheetRow: { height: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: C.hairline },
  fabBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: C.ink, fontSize: fs(24), lineHeight: fs(26), fontFamily: F.body },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  emptyTile: { width: 52, height: 52, borderRadius: r(16), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: F.head, fontSize: fs(16), color: C.ink },
  emptyText: { fontFamily: F.body, fontSize: fs(13.5), lineHeight: fs(20), color: C.sub, maxWidth: 260, textAlign: 'center' },
  emptyBtn: { height: 44, paddingHorizontal: 20, borderRadius: r(12), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  emptyBtnText: { fontFamily: F.bodySemi, fontSize: fs(14.5), color: '#FFFFFF' },
  // the quick-log chip: 32px, radius 8, hairline border, accent tint when picked
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
}));
