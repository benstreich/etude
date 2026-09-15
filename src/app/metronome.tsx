// Full-screen metronome (Tools tab). Same engine and controls as the sheet the
// Practice screen opens; this is the front door for people who came for the click.
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MetronomeControls } from '@/components/metronome';
import { Text } from '@/components/text';
import { ScreenTitle } from '@/components/ui';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

export default function MetronomePage() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]} showsVerticalScrollIndicator={false}>
      <Pressable hitSlop={8} onPress={() => router.back()}>
        <Text style={s.back}>{store.t('drone.back')}</Text>
      </Pressable>
      <ScreenTitle>{store.t('metronome.metronome')}</ScreenTitle>
      <MetronomeControls />
    </ScrollView>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 18 },
  back: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
}));
