// Tools tab: the metronome, tuner and drone get a front door instead of hiding
// as pills on the Practice screen.
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { EntryRow, Overline, PulseRing } from '@/components/ui';
import { useMetronome } from '@/lib/metronome';
import { useStore } from '@/lib/store';
import { tempoTerm } from '@/lib/tempo';
import { F, themed, useC, type T } from '@/lib/theme';

export default function Tools() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { running, bpm, timeSig } = useMetronome();

  const tools: { href: Href; title: string; blurb: string; accent?: boolean; glyph: React.ReactNode }[] = [
    {
      href: '/metronome',
      title: store.t('tools.metronome'),
      blurb: running ? store.t('tools.metronomeRunning', { bpm, term: tempoTerm(bpm), sig: timeSig }) : store.t('tools.metronomeBlurb'),
      accent: running,
      glyph: <Text style={[s.glyph, { fontFamily: F.notation }]}>{'\u{1D15F}'}</Text>,
    },
    // the text font's sharp, not the notation font's: Noto Music hangs its accidentals off the baseline and the tile read off-centre
    { href: '/tuner', title: store.t('tools.tuner'), blurb: store.t('tools.tunerBlurb'), glyph: <Text style={s.glyph}>{'♯'}</Text> },
    { href: '/drone', title: store.t('tools.drone'), blurb: store.t('tools.droneBlurb'), glyph: <Text style={s.glyph}>~</Text> },
    { href: '/learn', title: store.t('tools.learn'), blurb: store.t('tools.learnBlurb'), glyph: <Text style={s.glyph}>§</Text> },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <View style={s.headRow}>
        <Overline>{store.t('tabs.tools')}</Overline>
        {running && (
          <View style={s.headTempo}>
            <View style={{ width: 8, height: 8 }}>
              <PulseRing color={C.accent} size={8} active={running} />
              <View style={s.dot} />
            </View>
            <Text style={s.headTempoText}>{bpm}</Text>
            <Text style={[s.headTempoText, { fontFamily: F.accent }]}>{tempoTerm(bpm)}</Text>
          </View>
        )}
      </View>
      <Text style={s.title}>{store.t('tools.title')}</Text>
      <View style={{ marginTop: 24 }}>
        {tools.map((tool, i) => (
          <EntryRow
            key={String(tool.href)}
            keySize={52}
            keyStyle={{ borderWidth: 1.5, borderColor: C.ink }}
            keyContent={tool.glyph}
            title={tool.title}
            subline={<Text style={[s.tileBlurb, tool.accent && { color: C.accent }]}>{tool.blurb}</Text>}
            close={i === tools.length - 1}
            onPress={() => router.push(tool.href)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40 },
  headRow: { flexDirection: 'row', alignItems: 'center', height: 36 },
  headTempo: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  headTempoText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.accent },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  glyph: { fontFamily: F.body, fontSize: fs(26), color: C.ink, lineHeight: fs(30), includeFontPadding: false, textAlignVertical: 'center' },
  tileBlurb: { fontFamily: F.body, fontSize: fs(16), lineHeight: fs(22), color: C.subStrong },
}));
