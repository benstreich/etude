// A/B recording compare (#17) — two takes seek-locked so flipping keeps the
// playback position, for hearing progress on the same passage.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';
import { applyAudioMode } from '@/lib/audio-mode';
import { dayLabel, Recording, resolveRecordingUri, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.round(sec)) % 60).padStart(2, '0')}`;

const gapLabel = (a: Recording, b: Recording, t: (key: string, opts?: Record<string, unknown>) => string) => {
  const days = Math.abs((new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000);
  if (days < 1) return t('compare.sameDay');
  if (days < 30) return t('compare.daysApart', { count: Math.round(days) });
  return t('compare.monthsApart', { count: Math.round(days / 30) });
};

export default function Compare() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ piece: string; a: string; b: string }>();
  const [active, setActive] = useState<'A' | 'B'>('A');
  const [pickOpen, setPickOpen] = useState(false);

  const takes = store.recordings.filter((r) => r.piece === params.piece);
  const recA = takes.find((r) => r.id === params.a);
  const recB = takes.find((r) => r.id === params.b);

  const playerA = useAudioPlayer();
  const playerB = useAudioPlayer();
  const statusA = useAudioPlayerStatus(playerA);
  const statusB = useAudioPlayerStatus(playerB);

  const uriA = recA?.uri;
  const uriB = recB?.uri;
  // reset the flip to A whenever the pair changes (adjust-state-during-render,
  // react.dev "you might not need an effect")
  const pairKey = `${uriA}|${uriB}`;
  const [prevPair, setPrevPair] = useState(pairKey);
  if (prevPair !== pairKey) {
    setPrevPair(pairKey);
    setActive('A');
  }
  useEffect(() => {
    applyAudioMode({ playsInSilentMode: true, allowsRecording: false });
    if (uriA) playerA.replace(resolveRecordingUri(uriA));
    if (uriB) playerB.replace(resolveRecordingUri(uriB));
  }, [uriA, uriB, playerA, playerB]);

  if (!recA || !recB) return null;

  const cur = active === 'A' ? playerA : playerB;
  const curStatus = active === 'A' ? statusA : statusB;
  const playing = curStatus.playing;

  // flip swaps the audio at the SAME position (clamped if the other take is shorter)
  const flip = (to: 'A' | 'B') => {
    if (to === active) return;
    const target = to === 'A' ? playerA : playerB;
    const targetDur = to === 'A' ? statusA.duration : statusB.duration;
    const pos = Math.min(curStatus.currentTime, Math.max(0, (targetDur || Infinity) - 0.05));
    const wasPlaying = playing;
    cur.pause();
    target.seekTo(pos);
    if (wasPlaying) target.play();
    setActive(to);
  };

  const toggle = (which: 'A' | 'B') => {
    if (which !== active) return flip(which);
    if (playing) cur.pause();
    else cur.play();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
      <View style={s.navRow}>
        <Pressable style={s.navBtn} onPress={() => router.back()} hitSlop={8}>
          <Text style={s.navGlyph}>‹</Text>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => setPickOpen(true)}>
          <Text style={s.changeLink}>{store.t('compare.changeTakes')}</Text>
        </Pressable>
      </View>

      <View>
        <Text style={s.title}>{store.t('compare.title')}</Text>
        <Text style={s.meta}>
          {params.piece} · {gapLabel(recA, recB, store.t)}
        </Text>
      </View>

      <TakeCard which="A" rec={recA} isActive={active === 'A'} playing={playing} elapsed={statusA.currentTime} duration={statusA.duration} onToggle={() => toggle('A')} />
      <TakeCard which="B" rec={recB} isActive={active === 'B'} playing={playing} elapsed={statusB.currentTime} duration={statusB.duration} onToggle={() => toggle('B')} />

      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={s.flipTrack}>
          {(['A', 'B'] as const).map((w) => (
            <Pressable key={w} style={[s.flipBtn, active === w && { backgroundColor: C.accent }]} onPress={() => flip(w)}>
              <Text style={[s.flipText, active === w && { color: '#FFFFFF' }]}>{active === w ? store.t('compare.playing', { which: w }) : w}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.flipHint}>{store.t('compare.flipHint')}</Text>
      </View>

      <Modal visible={pickOpen} transparent animationType="fade" onRequestClose={() => setPickOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setPickOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{store.t('compare.changeTakes')}</Text>
            <Text style={s.sheetHint}>{store.t('compare.pickHint')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {takes.map((rec) => {
                const slot = rec.id === recA.id ? 'A' : rec.id === recB.id ? 'B' : null;
                return (
                  <Pressable
                    key={rec.id}
                    style={s.pickRow}
                    onPress={() => {
                      // picked take becomes A; the current A slides to B
                      if (rec.id === recA.id) return;
                      router.setParams({ a: rec.id, b: rec.id === recB.id ? recA.id : recB.id });
                    }}>
                    <Text style={s.pickName} numberOfLines={1}>
                      {rec.name || dayLabel(rec.date, store.today, store.t, store.lang)}
                    </Text>
                    <Text style={s.takeMeta}>{fmt(rec.sec)}</Text>
                    {slot && (
                      <View style={[s.badge, { backgroundColor: slot === 'A' ? C.accent : C.track }]}>
                        <Text style={[s.badgeText, { color: slot === 'A' ? '#FFFFFF' : C.sub }]}>{slot}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function TakeCard({
  which,
  rec,
  isActive,
  playing,
  elapsed,
  duration,
  onToggle,
}: {
  which: 'A' | 'B';
  rec: Recording;
  isActive: boolean;
  playing: boolean;
  elapsed: number;
  duration: number;
  onToggle: () => void;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const progress = isActive && duration ? elapsed / duration : 0;
  return (
    <Card style={[{ padding: 16, gap: 12 }, isActive && { borderColor: C.accent, borderWidth: 1.5 }]}>
      <View style={s.takeHead}>
        <View style={[s.badge, isActive ? { backgroundColor: C.accent } : { backgroundColor: C.track }]}>
          <Text style={[s.badgeText, isActive ? { color: '#FFFFFF' } : { color: C.sub }]}>{which}</Text>
        </View>
        <Text style={s.takeDate}>{rec.name || dayLabel(rec.date, store.today, store.t, store.lang)}</Text>
        <Text style={s.takeMeta}>{fmt(rec.sec)}</Text>
      </View>
      <View style={s.playRow}>
        <Pressable
          style={[s.playBtn, isActive ? { backgroundColor: C.accent, borderColor: C.accent } : { borderColor: C.inputBorder }]}
          onPress={onToggle}>
          <Text style={[s.playGlyph, isActive && { color: '#FFFFFF' }]}>{isActive && playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <View style={s.wave}>
          {(rec.wave ?? Array(40).fill(0.4)).map((v: number, j: number, arr: number[]) => (
            <View
              key={j}
              style={{
                flex: 1,
                height: 4 + v * 22,
                borderRadius: 2,
                backgroundColor: (j + 1) / arr.length <= progress ? C.accent : C.chartInactive,
              }}
            />
          ))}
        </View>
        <Text style={s.elapsed}>{isActive ? fmt(elapsed) : '0:00'}</Text>
      </View>
    </Card>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 18 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navBtn: { width: 36, height: 36, borderRadius: r(18), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { fontSize: fs(18), color: C.ink, lineHeight: fs(20) },
  changeLink: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.accent },
  title: { fontFamily: F.head, fontSize: fs(26), letterSpacing: -0.4, color: C.ink },
  meta: { fontFamily: F.body, fontSize: fs(14.5), color: C.sub, marginTop: 4 },
  takeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 24, height: 24, borderRadius: r(12), alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.bodySemi, fontSize: fs(12) },
  takeDate: { flex: 1, fontFamily: F.bodySemi, fontSize: fs(14.5), color: C.ink },
  takeMeta: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { width: 40, height: 40, borderRadius: r(20), borderWidth: 1, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { fontSize: fs(13), color: C.ink },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 },
  elapsed: { fontFamily: F.bodyMed, fontSize: fs(12), color: C.sub, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
  flipTrack: { flexDirection: 'row', backgroundColor: C.track, borderRadius: r(999), padding: 3, marginTop: 6 },
  flipBtn: { height: 40, paddingHorizontal: 22, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
  flipText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.sub },
  flipHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 12 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  sheetHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: C.hairline },
  pickName: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
}));
