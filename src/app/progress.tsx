import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShareIcon } from '@/components/icons';
import { ProgressBody } from '@/components/progress';
import { ShareSheet } from '@/components/report-modal';
import { ScreenTitle } from '@/components/ui';
import { useStore } from '@/lib/store';
import { themed, useC, type T } from '@/lib/theme';

/** The progress screen: a title, the share button, and the section list. Kept as a route for deep links. */
export default function Progress() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [shareOpen, setShareOpen] = useState(false);
  const empty = store.totalMin === 0 && store.sessions.length === 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ProgressBody
        header={
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ScreenTitle>{store.t('tabs.progress')}</ScreenTitle>
            {!empty && (
              <Pressable testID="progress-share" style={s.shareBtn} hitSlop={8} onPress={() => setShareOpen(true)}>
                <ShareIcon />
              </Pressable>
            )}
          </View>
        }
      />
      {/* recap card or practice report (#99) — the chooser owns both modals */}
      <ShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} />
    </ScrollView>
  );
}

const useS = themed(({ C, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  shareBtn: { width: 38, height: 38, borderRadius: r(19), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
}));
