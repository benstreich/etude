// Full-screen metronome (Tools tab). Same engine and controls as the sheet the
// Practice screen opens; this is the front door for people who came for the click.
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MetronomeControls } from '@/components/metronome';
import { Text } from '@/components/text';
import { BackLink } from '@/components/ui';
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
      <BackLink label={store.t('tabs.tools')} onPress={() => router.back()} />
      <Text style={s.title}>{store.t('metronome.metronome')}</Text>
      <MetronomeControls />
    </ScrollView>
  );
}

const useS = themed(({ fs, C }: T) => StyleSheet.create({
  // the controls are a flat list of sibling sections — the gap is what separates them
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 28 },
  title: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
}));
