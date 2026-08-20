import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { applyAudioMode } from '@/lib/audio-mode';
import { dayLabel, Recording, resolveRecordingUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// "Today, 2:35 PM" — older recordings without a timestamp just show the day
const when = (r: Recording, today: string) =>
  dayLabel(r.date, today) +
  (r.at ? `, ${new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');

// one player per list — starting a row stops whichever row was playing
export function RecordingsList({ recordings, showPiece = false }: { recordings: Recording[]; showPiece?: boolean }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // adjust-state-during-render pattern (react.dev "you might not need an effect")
  const [prevFinish, setPrevFinish] = useState(status.didJustFinish);
  if (prevFinish !== status.didJustFinish) {
    setPrevFinish(status.didJustFinish);
    if (status.didJustFinish) setCurrentId(null);
  }

  const toggle = (r: Recording) => {
    if (currentId === r.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    applyAudioMode({ playsInSilentMode: true, allowsRecording: false });
    player.replace(resolveRecordingUri(r.uri));
    player.play();
    setCurrentId(r.id);
  };

  const remove = (r: Recording) => {
    if (currentId === r.id) {
      player.pause();
      setCurrentId(null);
    }
    try {
      new File(resolveRecordingUri(r.uri)).delete();
    } catch {}
    store.deleteRecording(r.id);
  };

  if (recordings.length === 0) return null;

  // starred ("really important") recordings float to the top
  const list = [...recordings].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));

  return (
    <View>
      {list.map((r, i) => {
        const playing = currentId === r.id && status.playing;
        const progress = currentId === r.id && status.duration ? status.currentTime / status.duration : 0;
        return (
          <View key={r.id} style={[i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}>
            <View style={s.row}>
            <Pressable style={[s.playBtn, playing && { backgroundColor: C.accent }]} hitSlop={8} onPress={() => toggle(r)}>
              <Text style={s.playText}>{playing ? '❚❚' : '▶'}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              {editingId === r.id ? (
                <TextInput
                  style={s.nameInput}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Recording name"
                  placeholderTextColor={C.tertiary}
                  autoFocus
                  onSubmitEditing={() => {
                    store.renameRecording(r.id, draft);
                    setEditingId(null);
                  }}
                  onBlur={() => {
                    store.renameRecording(r.id, draft);
                    setEditingId(null);
                  }}
                  returnKeyType="done"
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setDraft(r.name ?? '');
                    setEditingId(r.id);
                  }}>
                  <Text style={s.piece} numberOfLines={1}>
                    {r.name || (showPiece ? r.piece : 'Untitled')}
                  </Text>
                  <Text style={s.meta}>
                    {when(r, store.today)} · {fmt(r.sec)}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable hitSlop={8} onPress={() => store.toggleStar(r.id)}>
              <Text style={[s.star, r.starred && { color: C.accent }]}>{r.starred ? '★' : '☆'}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => remove(r)}>
              <Text style={s.delete}>Delete</Text>
            </Pressable>
            </View>
            {currentId === r.id && !!r.wave?.length && (
              <View style={s.wave}>
                {r.wave.map((v, j) => (
                  <View
                    key={j}
                    style={{
                      flex: 1,
                      height: 4 + v * 24,
                      borderRadius: 2,
                      backgroundColor: (j + 1) / r.wave!.length <= progress ? C.accent : C.chartInactive,
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  playBtn: { width: 34, height: 34, borderRadius: r(17), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  playText: { color: C.bg, fontSize: fs(12) },
  piece: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
  meta: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  nameInput: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink, padding: 0, borderBottomWidth: 1, borderBottomColor: C.accent },
  delete: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.accent },
  star: { fontSize: fs(18), color: C.faint, lineHeight: fs(22) },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, marginBottom: 10 },
}));
