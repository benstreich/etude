import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';

import { Text } from '@/components/text';
import { applyAudioMode } from '@/lib/audio-mode';
import { dayLabel, Recording, resolveRecordingUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';
import { dragTrim } from '@/lib/trim-math';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// "Today, 2:35 PM" — older recordings without a timestamp just show the day
const when = (r: Recording, store: ReturnType<typeof useStore>) =>
  dayLabel(r.date, store.today, store.t, store.lang) +
  (r.at ? `, ${new Date(r.at).toLocaleTimeString(store.lang, { hour: 'numeric', minute: '2-digit' })}` : '');

const clipStart = (r: Recording) => r.start ?? 0;
const clipEnd = (r: Recording) => r.end ?? r.sec;

// one player per list — starting a row stops whichever row was playing
export function RecordingsList({ recordings, showPiece = false }: { recordings: Recording[]; showPiece?: boolean }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trimId, setTrimId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [waveW, setWaveW] = useState(1);

  // adjust-state-during-render pattern (react.dev "you might not need an effect")
  const [prevFinish, setPrevFinish] = useState(status.didJustFinish);
  if (prevFinish !== status.didJustFinish) {
    setPrevFinish(status.didJustFinish);
    if (status.didJustFinish) setCurrentId(null);
  }

  // the trim is non-destructive: the file keeps its tail, playback stops at the
  // out point (and loops back to the in point when the row is set to loop)
  const current = recordings.find((r) => r.id === currentId);
  useEffect(() => {
    if (!current || !status.playing) return;
    if (status.currentTime < clipEnd(current)) return;
    player.seekTo(clipStart(current));
    if (!current.loop) player.pause(); // parked at the in point, so the next tap replays the clip
  }, [current, status.currentTime, status.playing, player]);

  const toggle = (r: Recording) => {
    if (currentId === r.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    applyAudioMode({ playsInSilentMode: true, allowsRecording: false });
    player.replace(resolveRecordingUri(r.uri));
    player.seekTo(clipStart(r));
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

  // ponytail: shares the whole file — trimming AAC needs a native encoder we don't have
  const share = (r: Recording) => {
    Sharing.shareAsync(resolveRecordingUri(r.uri), { mimeType: 'audio/mp4', dialogTitle: r.name || r.piece }).catch(() => {});
  };

  const drag = (r: Recording, x: number) => store.updateRecording(r.id, dragTrim(r, x, waveW));

  if (recordings.length === 0) return null;

  // starred ("really important") recordings float to the top
  const list = [...recordings].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));

  return (
    <View>
      {list.map((r, i) => {
        const playing = currentId === r.id && status.playing;
        const trimming = trimId === r.id;
        const showWave = !!r.wave?.length && (currentId === r.id || trimming);
        const progress = currentId === r.id && r.sec ? status.currentTime / r.sec : 0;
        const trimmed = r.start !== undefined || r.end !== undefined;
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
                  placeholder={store.t('recordings.namePlaceholder')}
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
                    {r.name || (showPiece ? r.piece : store.t('recordings.untitled'))}
                  </Text>
                  <Text style={s.meta}>
                    {when(r, store)} · {fmt(clipEnd(r) - clipStart(r))}
                    {trimmed ? ' ✂' : ''}
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable hitSlop={8} onPress={() => setTrimId(trimming ? null : r.id)}>
              <Text style={[s.icon, trimming && { color: C.accent }]}>✂</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => store.toggleStar(r.id)}>
              <Text style={[s.star, r.starred && { color: C.accent }]}>{r.starred ? '★' : '☆'}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => remove(r)}>
              <Text style={s.delete}>{store.t('recordings.delete')}</Text>
            </Pressable>
            </View>
            {showWave && (
              <View
                style={s.wave}
                onLayout={(e) => setWaveW(e.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => trimming}
                onMoveShouldSetResponder={() => trimming}
                onResponderGrant={(e) => drag(r, e.nativeEvent.locationX)}
                onResponderMove={(e) => drag(r, e.nativeEvent.locationX)}>
                {r.wave!.map((v, j) => {
                  const at = ((j + 0.5) / r.wave!.length) * r.sec;
                  const outside = at < clipStart(r) || at > clipEnd(r);
                  return (
                    <View
                      key={j}
                      style={{
                        flex: 1,
                        height: 4 + v * 24,
                        borderRadius: 2,
                        opacity: outside ? 0.3 : 1,
                        backgroundColor: !outside && (j + 1) / r.wave!.length <= progress ? C.accent : C.chartInactive,
                      }}
                    />
                  );
                })}
              </View>
            )}
            {trimming && (
              <View style={s.trimBar}>
                <Text style={s.meta}>
                  {fmt(clipStart(r))} – {fmt(clipEnd(r))}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable hitSlop={8} onPress={() => store.updateRecording(r.id, { loop: !r.loop })}>
                  <Text style={[s.icon, r.loop && { color: C.accent }]}>↻</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => store.updateRecording(r.id, { start: undefined, end: undefined })}>
                  <Text style={s.icon}>⟲</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => share(r)}>
                  <Text style={s.icon}>⤴</Text>
                </Pressable>
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
  icon: { fontSize: fs(16), color: C.sub, lineHeight: fs(22) },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, marginBottom: 10 },
  trimBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 10 },
}));
