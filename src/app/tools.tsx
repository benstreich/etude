// Tools tab: the metronome, tuner and drone get a front door instead of hiding
// as pills on the Practice screen.
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon, MetronomeIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { Card, ScreenTitle } from '@/components/ui';
import { useMetronome } from '@/lib/metronome';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function Tools() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { running, bpm } = useMetronome();

  const tools: { href: Href; title: string; blurb: string; glyph: React.ReactNode }[] = [
    { href: '/metronome', title: store.t('tools.metronome'), blurb: running ? `♩ ${bpm}` : store.t('tools.metronomeBlurb'), glyph: <MetronomeIcon size={26} /> },
    { href: '/tuner', title: store.t('tools.tuner'), blurb: store.t('tools.tunerBlurb'), glyph: <Text style={s.glyph}>♯</Text> },
    { href: '/drone', title: store.t('tools.drone'), blurb: store.t('tools.droneBlurb'), glyph: <Text style={s.glyph}>~</Text> },
    { href: '/learn', title: store.t('tools.learn'), blurb: store.t('tools.learnBlurb'), glyph: <Text style={s.glyph}>§</Text> },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>{store.t('tools.title')}</ScreenTitle>
      {tools.map((tool) => (
        <Pressable key={String(tool.href)} onPress={() => router.push(tool.href)}>
          {({ pressed }) => (
            <Card style={[s.tile, pressed && { transform: [{ scale: 0.985 }] }]}>
              <View style={s.glyphBox}>{tool.glyph}</View>
              <View style={{ flex: 1 }}>
                <Text style={s.tileTitle}>{tool.title}</Text>
                <Text style={[s.tileBlurb, running && tool.href === '/metronome' && { color: C.accent }]}>{tool.blurb}</Text>
              </View>
              <ChevronIcon />
            </Card>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 14 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  glyphBox: { width: 52, height: 52, borderRadius: r(16), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: F.head, fontSize: fs(26), color: C.accent, lineHeight: fs(30) },
  tileTitle: { fontFamily: F.bodySemi, fontSize: fs(17), color: C.ink },
  tileBlurb: { fontFamily: F.body, fontSize: fs(13), color: C.sub, marginTop: 2 },
}));
