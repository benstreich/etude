// Practice science (Tools tab): the reading list behind the app. Entries come
// from src/lib/evidence.ts; the prose is in the locales; a few entries show one
// line computed from the user's own rows so a finding lands against their data.
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Card, Overline } from '@/components/ui';
import { ENTRIES, GROUPS, type Entry, type EvidenceGroup, type StatHook } from '@/lib/evidence';
import { consistency, interleaving } from '@/lib/stats-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const GROUP_KEY: Record<EvidenceGroup, string> = {
  practice: 'learn.groupPractice',
  learning: 'learn.groupLearning',
  people: 'learn.groupPeople',
};

export default function Learn() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const monday = store.weekStart === 'Monday';

  // One line per hook, or null when the app does not know enough to say it.
  const statLine = (hook: StatHook): string | null => {
    if (store.sessions.length === 0) return null;
    if (hook === 'interleaving') {
      const inter = interleaving(store.sessions, store.today, monday);
      return inter ? store.t('learn.statInterleaving', { n: inter.perDay }) : null;
    }
    if (hook === 'spacing') {
      const cons = consistency(store.minutesByDate, store.today, monday);
      return cons.average > 0 ? store.t('learn.statSpacing', { n: cons.average }) : null;
    }
    const total = store.sessions.reduce((a, x) => a + x.min, 0);
    const avg = Math.round(total / store.sessions.length);
    return avg > 0 ? store.t('learn.statSessionLength', { n: avg }) : null;
  };

  const open = (url: string) =>
    Linking.openURL(url).catch(() => store.showToast(store.t('settings.linkFailed')));

  const renderEntry = (e: Entry) => {
    const stat = e.stat ? statLine(e.stat) : null;
    return (
      <Card key={e.id} style={s.entry}>
        <View style={s.headRow}>
          <Text style={s.takeaway}>{store.t(`learn.e.${e.id}.takeaway`)}</Text>
          {e.contested && (
            <View style={s.chip}>
              <Text style={s.chipText}>{store.t('learn.contested')}</Text>
            </View>
          )}
        </View>
        <Text style={s.finding}>{store.t(`learn.e.${e.id}.finding`)}</Text>
        {e.caveat && <Text style={s.caveat}>{store.t(`learn.e.${e.id}.caveat`)}</Text>}
        {stat && (
          <View style={s.statBox}>
            <Text style={s.statLabel}>{store.t('learn.yours')}</Text>
            <Text style={s.statText}>{stat}</Text>
          </View>
        )}
        <View style={s.sources}>
          {e.sources.map((src) => (
            <Pressable key={src.url} onPress={() => open(src.url)} hitSlop={6}>
              {({ pressed }) => (
                <View style={s.source}>
                  <Text style={[s.srcTitle, pressed && { color: C.accentDark }]} numberOfLines={3}>
                    {src.title}
                  </Text>
                  <Text style={s.srcMeta}>
                    {src.authors} · {src.year} · {src.where}
                    {src.oa ? ` · ${store.t('learn.free')}` : ''}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </Card>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <Pressable hitSlop={8} onPress={() => router.back()}>
        <Text style={s.back}>{store.t('learn.back')}</Text>
      </Pressable>
      <Text style={s.title}>{store.t('learn.title')}</Text>
      <Text style={s.intro}>{store.t('learn.intro')}</Text>
      {GROUPS.map((g) => (
        <View key={g} style={s.group}>
          <Overline>{store.t(GROUP_KEY[g])}</Overline>
          {ENTRIES.filter((e) => e.group === g).map(renderEntry)}
        </View>
      ))}
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 48 },
  back: { fontFamily: F.body, fontSize: fs(15), color: C.sub, marginBottom: 12 },
  title: { fontFamily: F.head, fontSize: fs(30), color: C.ink, lineHeight: fs(37) },
  intro: { fontFamily: F.body, fontSize: fs(14), color: C.subStrong, lineHeight: fs(21), marginTop: 8, marginBottom: 8 },
  group: { marginTop: 24, gap: 12 },
  entry: { padding: 18, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  takeaway: { flex: 1, fontFamily: F.bodySemi, fontSize: fs(16), color: C.ink, lineHeight: fs(22) },
  chip: { backgroundColor: C.track, borderRadius: r(6), paddingHorizontal: 7, paddingVertical: 3, marginTop: 2 },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(10), color: C.subStrong, letterSpacing: 0.3 },
  finding: { fontFamily: F.body, fontSize: fs(14), color: C.ink, lineHeight: fs(21) },
  caveat: { fontFamily: F.body, fontSize: fs(13), color: C.subStrong, lineHeight: fs(20), borderLeftWidth: 2, borderLeftColor: C.track, paddingLeft: 10 },
  statBox: { backgroundColor: C.accentTint, borderRadius: r(10), padding: 10, gap: 2 },
  statLabel: { fontFamily: F.bodyMed, fontSize: fs(10), color: C.accent, letterSpacing: 0.4, textTransform: 'uppercase' },
  statText: { fontFamily: F.body, fontSize: fs(13), color: C.ink, lineHeight: fs(19) },
  sources: { gap: 10, marginTop: 2 },
  source: { gap: 2 },
  srcTitle: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.accent, lineHeight: fs(19) },
  srcMeta: { fontFamily: F.body, fontSize: fs(11.5), color: C.tertiary, lineHeight: fs(17) },
}));
