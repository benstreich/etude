// Piece detail — stage, stats, target tempo, recordings, and session history.
// ponytail: sessions/recordings join on the piece *name*, like everywhere else
// in the app (pieces can't be renamed); move to id-joins if rename ever lands.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditSessionSheet } from '@/components/edit-session';
import { MetronomeIcon } from '@/components/icons';
import { MetronomeButton } from '@/components/metronome';
import { RecordingsList } from '@/components/recordings';
import { Card, Overline } from '@/components/ui';
import { MAX_BPM } from '@/lib/metronome-math';
import { dayLabel, Session, useStore } from '@/lib/store';
import { F, themed, useC, type Palette, type T } from '@/lib/theme';

const fmtTime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`);
const stageColor = (C: Palette, i: number, n: number) => (i >= n - 1 ? C.success : C.accent);

export default function PieceDetail() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [target, setTarget] = useState('');
  const [editSess, setEditSess] = useState<Session | null>(null);

  const piece = store.pieces.find((p) => p.id === id);
  if (!piece) return null; // removed while open — the back nav below already left

  const sessions = store.sessions.filter((x) => x.title === piece.name);
  const recordings = store.recordings.filter((r) => r.piece === piece.name);
  const totalMin = sessions.reduce((a, x) => a + x.min, 0);
  const last = sessions[0]?.date; // sessions are kept sorted newest-first
  const n = store.stages.length;
  const stage = Math.min(piece.stage, n - 1);
  const added = piece.addedAt
    ? new Date(piece.addedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null;

  const openTempo = () => {
    setCur(piece.currentBpm ? String(piece.currentBpm) : '');
    setTarget(piece.targetBpm ? String(piece.targetBpm) : '');
    setTempoOpen(true);
  };
  const saveTempo = () => {
    const parse = (t: string) => {
      const v = Math.round(Number(t));
      return Number.isFinite(v) && v > 0 && v <= MAX_BPM ? v : undefined;
    };
    store.updatePiece(piece.id, { currentBpm: parse(cur), targetBpm: parse(target) });
    setTempoOpen(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
      <View style={s.navRow}>
        <Pressable style={s.navBtn} onPress={() => router.back()} hitSlop={8}>
          <Text style={s.navGlyph}>‹</Text>
        </Pressable>
        <Pressable style={s.navBtn} onPress={() => setMenuOpen(true)} hitSlop={8}>
          <Text style={s.navGlyph}>⋯</Text>
        </Pressable>
      </View>

      <View>
        <Text style={s.title}>{piece.name}</Text>
        <Text style={s.meta}>{[piece.by, added && `added ${added}`].filter(Boolean).join(' · ') || ' '}</Text>
      </View>

      <Card style={{ padding: 16, gap: 12 }}>
        <View style={s.rowBetween}>
          <Text style={s.cardLabel}>Stage</Text>
          <Text style={[s.stageName, { color: stageColor(C, stage, n) }]}>{store.stages[stage]}</Text>
        </View>
        <View style={s.segRow}>
          {store.stages.map((_, i) => (
            <Pressable
              key={i}
              style={[s.seg, { backgroundColor: i <= stage ? stageColor(C, stage, n) : C.track }]}
              hitSlop={{ top: 10, bottom: 10 }}
              onPress={() => store.updatePiece(piece.id, { stage: i })}
            />
          ))}
        </View>
        <View style={s.segRow}>
          {store.stages.map((label, i) => (
            <Text key={i} style={[s.stageLabel, i === stage && { color: C.accent, fontFamily: F.bodySemi }]} numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(
          [
            ['Total', fmtTime(totalMin)],
            ['Sessions', String(sessions.length)],
            ['Last', last ? dayLabel(last, store.today) : '—'],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} style={s.stat}>
            <Overline style={{ marginBottom: 8, fontSize: 11 }}>{label}</Overline>
            <Text style={s.statNum} numberOfLines={1}>
              {value}
            </Text>
          </Card>
        ))}
      </View>

      {piece.currentBpm || piece.targetBpm ? (
        <Card style={{ padding: 16 }}>
          <View style={s.tempoRow}>
            <MetronomeIcon />
            <Pressable style={{ flex: 1 }} onPress={openTempo}>
              <Text style={s.cardLabel}>Target tempo</Text>
              <Text style={s.tempoValue}>
                {piece.currentBpm ?? '—'}
                <Text style={s.tempoTarget}> / {piece.targetBpm ?? '—'} BPM</Text>
              </Text>
            </Pressable>
            <MetronomeButton compact presetBpm={piece.currentBpm ?? piece.targetBpm} />
          </View>
        </Card>
      ) : (
        <Pressable onPress={openTempo}>
          <Card style={[s.tempoRow, { padding: 16 }]}>
            <MetronomeIcon color={C.sub} />
            <Text style={s.ghostRowText}>Add target tempo</Text>
          </Card>
        </Pressable>
      )}

      {recordings.length > 0 && (
        <View style={{ gap: 12 }}>
          <Overline>Recordings · {recordings.length}</Overline>
          <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
            <RecordingsList recordings={recordings} />
          </Card>
        </View>
      )}

      {sessions.length > 0 && (
        <View style={{ gap: 12 }}>
          <Overline>History</Overline>
          <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
            {sessions.map((sess, i) => (
              <Pressable
                key={sess.id}
                style={[s.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
                onPress={() => setEditSess(sess)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.histDay}>{dayLabel(sess.date, store.today)}</Text>
                  {!!sess.note && (
                    <Text style={s.histNote} numberOfLines={1}>
                      {sess.note}
                    </Text>
                  )}
                </View>
                <Text style={s.histMin}>{sess.min} min</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      )}

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{piece.name}</Text>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                store.setArchived(piece.id, !piece.archived);
                setMenuOpen(false);
                router.back();
              }}>
              <Text style={s.sheetRowText}>{piece.archived ? 'Restore to repertoire' : 'Archive'}</Text>
            </Pressable>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.back();
                store.removePiece(piece.id);
              }}>
              <Text style={[s.sheetRowText, { color: C.accent }]}>Remove</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={tempoOpen} transparent animationType="fade" onRequestClose={() => setTempoOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setTempoOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>Target tempo</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(
                  [
                    ['Current BPM', cur, setCur],
                    ['Target BPM', target, setTarget],
                  ] as const
                ).map(([ph, val, set]) => (
                  <TextInput
                    key={ph}
                    style={s.input}
                    value={val}
                    onChangeText={(t) => set(t.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder={ph}
                    placeholderTextColor={C.tertiary}
                  />
                ))}
              </View>
              <Pressable style={s.saveBtn} onPress={saveTempo}>
                <Text style={s.saveText}>Save</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 20 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, borderRadius: r(18), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { fontSize: fs(18), color: C.ink, lineHeight: fs(20) },
  title: { fontFamily: F.head, fontSize: fs(26), letterSpacing: -0.4, color: C.ink },
  meta: { fontFamily: F.body, fontSize: fs(14.5), color: C.sub, marginTop: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  stageName: { fontFamily: F.bodySemi, fontSize: fs(13) },
  segRow: { flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 6, borderRadius: r(999) },
  stageLabel: { flex: 1, fontFamily: F.body, fontSize: fs(11.5), color: C.tertiary },
  stat: { flex: 1, padding: 14 },
  statNum: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tempoValue: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink, marginTop: 2 },
  tempoTarget: { fontFamily: F.body, fontSize: fs(13), color: C.sub },
  ghostRowText: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.sub },
  histRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 12, paddingVertical: 8 },
  histDay: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
  histNote: { fontFamily: F.body, fontSize: fs(12), color: C.subStrong, marginTop: 1 },
  histMin: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.sub },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 14 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink, marginBottom: 4 },
  sheetRow: { height: 52, justifyContent: 'center' },
  sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  input: { flex: 1, height: 52, borderRadius: r(14), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
