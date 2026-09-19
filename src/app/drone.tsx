// Drone: one sustained reference pitch, looped until stopped (Tools tab).
// Twelve shipped samples cover A3..G#4; other octaves and a shifted A4 come from
// the playback rate with pitch correction off, so rate 2 is exactly an octave up.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { BackLink, EntryRow, Overline, Stepper, UnderlineTabs } from '@/components/ui';
import { applyAudioMode } from '@/lib/audio-mode';
import { A4_MAX, A4_MIN, DRONE_NOTES, DRONE_OCTAVES, droneFreq, droneRate, type DroneNote } from '@/lib/drone';
import { DRONE_SAMPLES } from '@/lib/drone-samples';
import { tap } from '@/lib/haptics';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const SAMPLES = DRONE_SAMPLES;


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
  // downloadFirst: in Expo Go the wav would otherwise stream from Metro, which
  // worked in the APK and not in Go; a local file behaves the same in both
  const player = useAudioPlayer(SAMPLES[note], { downloadFirst: true });
  const { isLoaded } = useAudioPlayerStatus(player);

  // the hook releases the player on unmount; loop and rate have to be re-applied
  // whenever the source swaps (a new note = a new native player) and once the
  // download lands — before that the player has no source and play() is a no-op
  useEffect(() => {
    if (!isLoaded) return;
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
  }, [player, isLoaded, note, octave, a4, playing]);

  useEffect(() => () => player.pause(), [player]);

  const hz = droneFreq(note, octave, a4);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <BackLink label={store.t('tabs.tools')} onPress={() => router.back()} />
      <Text style={s.title}>{store.t('drone.title')}</Text>

      <View style={{ alignItems: 'center' }}>
        <Text style={s.bigNote}>
          {note}
          <Text style={s.bigOct}>{octave}</Text>
        </Text>
        <Text style={s.hz}>{hz.toFixed(hz < 100 ? 2 : 1)} Hz</Text>
      </View>

      <View style={s.grid}>
        {DRONE_NOTES.map((n) => {
          const sel = n === note;
          return (
            <Pressable
              key={n}
              style={[s.key, sel && s.keySel]}
              onPress={() => {
                if (!sel) tap();
                setNote(n);
              }}>
              <Text style={[s.keyText, sel && { color: C.accent }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>

      <View>
        <Overline>{store.t('drone.octave')}</Overline>
        <View style={{ marginTop: 8 }}>
          <UnderlineTabs
            options={DRONE_OCTAVES.map((o) => ({ key: String(o), label: String(o) }))}
            value={String(octave)}
            onChange={(v) => setOctave(Number(v))}
            gap={24}
          />
        </View>
      </View>

      <View style={s.refRow}>
        <Overline>{store.t('drone.reference')}</Overline>
        <Stepper value={a4} min={A4_MIN} max={A4_MAX} size={30} onChange={setA4} />
      </View>

      <EntryRow
        keySize={52}
        keyStyle={playing ? { backgroundColor: C.accent } : { borderWidth: 1.5, borderColor: C.ink }}
        keyContent={playing ? <View style={s.stopSquare} /> : <PlayIcon color={C.ink} />}
        title={playing ? store.t('drone.stop') : store.t('drone.play')}
        right={null}
        close
        onPress={() => {
          if (playing) player.pause();
          setPlaying(!playing);
        }}
      />

      <Text style={s.hint}>{store.t('drone.hint')}</Text>
    </ScrollView>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 28 },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  bigNote: { fontFamily: F.head, fontSize: fs(72), color: C.ink, lineHeight: fs(78), letterSpacing: -2 },
  bigOct: { fontFamily: F.head, fontSize: fs(28), color: C.subStrong },
  hz: { fontFamily: F.accentMed, fontSize: fs(17), color: C.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // the quick-log chip, at key size
  key: { width: '22%', flexGrow: 1, height: 44, borderRadius: 8, backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  keySel: { borderColor: C.accent, backgroundColor: C.accentTint },
  keyText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  refRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.staffLine },
  stopSquare: { width: 14, height: 14, borderRadius: 2, backgroundColor: C.bg },
  hint: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong, lineHeight: fs(19) },
}));
