// Drone: one sustained reference pitch, looped until stopped (Tools tab).
// Twelve shipped samples cover A3..G#4; other octaves and a shifted A4 come from
// the playback rate with pitch correction off, so rate 2 is exactly an octave up.
import { useAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Card, ScreenTitle } from '@/components/ui';
import { applyAudioMode } from '@/lib/audio-mode';
import { DRONE_NOTES, DRONE_OCTAVES, droneFreq, droneRate, type DroneNote } from '@/lib/drone';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

// static requires so Metro bundles them; keyed by note, see scripts/make-drone.py
const SAMPLES: Record<DroneNote, number> = {
  A: require('../../assets/audio/drone_a.wav'),
  'A#': require('../../assets/audio/drone_as.wav'),
  B: require('../../assets/audio/drone_b.wav'),
  C: require('../../assets/audio/drone_c.wav'),
  'C#': require('../../assets/audio/drone_cs.wav'),
  D: require('../../assets/audio/drone_d.wav'),
  'D#': require('../../assets/audio/drone_ds.wav'),
  E: require('../../assets/audio/drone_e.wav'),
  F: require('../../assets/audio/drone_f.wav'),
  'F#': require('../../assets/audio/drone_fs.wav'),
  G: require('../../assets/audio/drone_g.wav'),
  'G#': require('../../assets/audio/drone_gs.wav'),
};

const A4_MIN = 432;
const A4_MAX = 446;

export default function Drone() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<DroneNote>('A');
  const [octave, setOctave] = useState<number>(4);
  const [a4, setA4] = useState(440);
  const [playing, setPlaying] = useState(false);
  const player = useAudioPlayer(SAMPLES[note]);

  // the hook releases the player on unmount; loop and rate have to be re-applied
  // whenever the source swaps (a new note = a new native player)
  useEffect(() => {
    // expo-audio exposes these as native setters, not hook state — the compiler
    // rule can't see that, hence the exemption
    // eslint-disable-next-line react-hooks/immutability
    player.loop = true;
    player.shouldCorrectPitch = false;
    player.setPlaybackRate(droneRate(note, octave, a4));
    if (playing) {
      applyAudioMode({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
      player.play();
    }
  }, [player, note, octave, a4, playing]);

  useEffect(() => () => player.pause(), [player]);

  const hz = droneFreq(note, octave, a4);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <Pressable hitSlop={8} onPress={() => router.back()}>
        <Text style={s.back}>{store.t('drone.back')}</Text>
      </Pressable>
      <ScreenTitle>{store.t('drone.title')}</ScreenTitle>

      <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 28 }}>
        <Text style={s.bigNote}>
          {note}
          <Text style={s.bigOct}>{octave}</Text>
        </Text>
        <Text style={s.hz}>{hz.toFixed(hz < 100 ? 2 : 1)} Hz</Text>
      </Card>

      <View style={s.grid}>
        {DRONE_NOTES.map((n) => {
          const sel = n === note;
          return (
            <Pressable key={n} style={[s.key, sel && s.keySel]} onPress={() => setNote(n)}>
              <Text style={[s.keyText, sel && { color: C.accent }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.row}>
        <Text style={s.label}>{store.t('drone.octave')}</Text>
        <View style={s.seg}>
          {DRONE_OCTAVES.map((o, i) => (
            <Pressable key={o} style={[s.segBtn, i > 0 && s.segBtnDivider, octave === o && s.segBtnSel]} onPress={() => setOctave(o)}>
              <Text style={[s.segText, octave === o && s.segTextSel]}>{o}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={s.row}>
        <Text style={s.label}>{store.t('drone.reference')}</Text>
        <View style={s.stepper}>
          <Pressable style={s.step} hitSlop={6} onPress={() => setA4((v) => Math.max(A4_MIN, v - 1))}>
            <Text style={s.stepText}>−</Text>
          </Pressable>
          <Text style={s.stepValue}>{a4}</Text>
          <Pressable style={s.step} hitSlop={6} onPress={() => setA4((v) => Math.min(A4_MAX, v + 1))}>
            <Text style={s.stepText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[s.playBtn, playing && s.playBtnOn]}
        onPress={() => {
          if (playing) player.pause();
          setPlaying(!playing);
        }}>
        <Text style={[s.playBtnText, playing && { color: C.bg }]}>{playing ? store.t('drone.stop') : store.t('drone.play')}</Text>
      </Pressable>

      <Text style={s.hint}>{store.t('drone.hint')}</Text>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 22 },
  back: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  bigNote: { fontFamily: F.head, fontSize: fs(64), color: C.ink, lineHeight: fs(70) },
  bigOct: { fontFamily: F.head, fontSize: fs(28), color: C.sub },
  hz: { fontFamily: F.accentMed, fontSize: fs(16), color: C.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: { width: '22%', flexGrow: 1, height: 48, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  keySel: { borderColor: C.accent, backgroundColor: C.accentTint },
  keyText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  seg: { flexDirection: 'row', height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  segBtnDivider: { borderLeftWidth: 1, borderLeftColor: C.inputBorder },
  segBtnSel: { backgroundColor: C.accentTint },
  segText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  segTextSel: { color: C.accent, fontFamily: F.bodySemi },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 40, height: 40, borderRadius: r(20), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(18), color: C.ink, lineHeight: fs(22) },
  stepValue: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink, minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
  playBtn: { height: 56, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  playBtnOn: { backgroundColor: C.accent },
  playBtnText: { fontFamily: F.bodySemi, fontSize: fs(17), color: C.bg },
  hint: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, lineHeight: fs(17) },
}));
