import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditSessionSheet } from '@/components/edit-session';
import { FlameIcon, LogoMark, PlayIcon } from '@/components/icons';
import { Bar, Card } from '@/components/ui';
import { dayLabel, Session, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

// taking `now` from the store keeps these reactive — a bare new Date() here gets
// cached once by the react-compiler and shows yesterday after a midnight rollover
const greeting = (now: number, t: (k: string) => string) => {
  const h = new Date(now).getHours();
  return h < 12 ? t('home.goodMorning') : h < 18 ? t('home.goodAfternoon') : t('home.goodEvening');
};

const dateLine = (now: number, lang: string) =>
  new Date(now).toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

export default function Home() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [focusOpen, setFocusOpen] = useState(false);
  const [editSess, setEditSess] = useState<Session | null>(null);

  const quickLog = (min: number) => {
    if (!min) return;
    const f = store.quickLogFocus;
    store.logMinutes(min, f?.name ?? 'Quick log', f?.kind ?? 'Logged');
    store.showToast(f ? store.t('home.addedMinFocus', { min, name: f.name }) : store.t('home.addedMinutes', { min }));
  };

  const focusOptions: { name: string; kind: 'Piece' | 'Technique' }[] = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ name: p.name, kind: 'Piece' as const })),
    ...store.techniques.map((t) => ({ name: t, kind: 'Technique' as const })),
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
      <View style={s.logoRow}>
        <LogoMark size={26} />
        <Text style={s.wordmark}>Étude</Text>
      </View>

      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.date}>{dateLine(store.now, store.lang)}</Text>
          <Text style={s.greeting}>{greeting(store.now, store.t)}</Text>
        </View>
        {store.streakMode !== 'off' && store.displayStreak > 0 && (
          <View style={s.streakPill}>
            <FlameIcon />
            <Text style={s.streakText}>{store.t('home.streak', { count: store.displayStreak })}</Text>
          </View>
        )}
      </View>

      <Card style={{ padding: 16 }}>
        <View style={s.todayRow}>
          <Text style={s.todayLabel}>{store.t('common.today')}</Text>
          <Text style={s.todayMeta}>
            {store.t('home.todayMeta', { done: store.todayMin, goal: store.dailyGoal })}
          </Text>
        </View>
        <Bar pct={(store.todayMin / store.dailyGoal) * 100} color={C.accent} height={6} />
      </Card>

      <Pressable style={({ pressed }) => [s.primaryBtn, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => router.push('/practice')}>
        <PlayIcon />
        <Text style={s.primaryBtnText}>{store.t('home.startPracticing')}</Text>
      </Pressable>

      <Card style={{ padding: 16 }}>
        <View style={s.quickHeader}>
          <Text style={s.quickTitle}>{store.t('home.quickLog')}</Text>
          <Pressable hitSlop={8} onPress={() => setFocusOpen(true)}>
            <Text style={s.helperFocus}>{store.quickLogFocus ? store.quickLogFocus.name : store.t('home.chooseFocus')}</Text>
          </Pressable>
        </View>
        <View style={s.quickRow}>
          {store.quickLog.map((m, i) => (
            <Pressable key={i} style={s.chip} onPress={() => quickLog(m)}>
              <Text style={s.chipText}>{store.t('home.chipMin', { min: m })}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {store.sessions.length === 0 ? (
        // first-run guide, shown until the first session exists
        <View style={s.guideCard}>
          <Text style={s.guideTitle}>{store.t('home.firstSession')}</Text>
          {(
            [
              [store.t('home.guide1Pre'), store.t('tabs.repertoire'), ''],
              [store.t('home.guide2Pre'), store.t('home.startPracticing'), store.t('home.guide2Post')],
              [store.t('home.guide3Pre'), store.t('home.quickLog'), store.t('home.guide3Post')],
            ] as const
          ).map(([pre, bold, post], i) => (
            <View key={i} style={s.guideRow}>
              <Text style={s.guideNum}>{i + 1}</Text>
              <Text style={s.guideText}>
                {pre}
                <Text style={{ fontFamily: F.bodySemi }}>{bold}</Text>
                {post}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Card style={{ padding: 16 }}>
          {store.sessions.slice(0, 3).map((sess, i) => (
            <Pressable
              key={sess.id}
              style={[s.sessRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
              onPress={() => setEditSess(sess)}>
              <View style={{ flex: 1 }}>
                <Text style={s.sessTitle}>{sess.title}</Text>
                <Text style={s.sessMeta}>
                  {sess.meta.includes('·') ? sess.meta : `${dayLabel(sess.date, store.today, store.t, store.lang)} · ${sess.meta}`}
                </Text>
                {!!sess.note && <Text style={s.sessNote}>{sess.note}</Text>}
              </View>
              <Text style={s.sessMin}>{store.t('home.min', { min: sess.min })}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      <Modal visible={focusOpen} transparent animationType="fade" onRequestClose={() => setFocusOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setFocusOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{store.t('home.quickLogFocus')}</Text>
            <View style={s.dayWrap}>
              <Pressable
                style={[s.dayChip, !store.quickLogFocus && s.dayChipSel]}
                onPress={() => {
                  store.updateSettings({ quickLogFocus: null });
                  setFocusOpen(false);
                }}>
                <Text style={[s.dayChipText, !store.quickLogFocus && { color: C.accent }]}>{store.t('home.nothingSpecific')}</Text>
              </Pressable>
              {focusOptions.map((f) => {
                const sel = store.quickLogFocus?.name === f.name && store.quickLogFocus.kind === f.kind;
                return (
                  <Pressable
                    key={`${f.kind}:${f.name}`}
                    style={[s.dayChip, sel && s.dayChipSel]}
                    onPress={() => {
                      store.updateSettings({ quickLogFocus: f });
                      setFocusOpen(false);
                    }}>
                    <Text style={[s.dayChipText, sel && { color: C.accent }]}>{f.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: F.head, fontSize: fs(16), color: C.ink, letterSpacing: -0.16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  date: { fontFamily: F.bodySemi, fontSize: fs(12), letterSpacing: 1.4, color: C.tertiary, marginBottom: 6 },
  greeting: { fontFamily: F.head, fontSize: fs(34), color: C.ink },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentTint, borderRadius: r(999), paddingVertical: 7, paddingHorizontal: 12 },
  streakText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  todayLabel: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  todayMeta: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  primaryBtn: { height: 56, borderRadius: r(14), backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryBtnText: { fontFamily: F.bodySemi, fontSize: fs(17), color: C.bg },
  quickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  quickTitle: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
  helperFocus: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.accent },
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { flex: 1, height: 44, borderRadius: r(12), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  guideCard: { backgroundColor: C.accentTint, borderRadius: r(16), padding: 18, gap: 12 },
  guideTitle: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accentDark },
  guideRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  guideNum: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.accent, width: 14, lineHeight: fs(20) },
  guideText: { flex: 1, fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.ink },
  sessRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  sessTitle: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  sessMeta: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 2 },
  sessNote: { fontFamily: F.body, fontSize: fs(12.5), color: C.subStrong, fontStyle: 'italic', marginTop: 3 },
  sessMin: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 16 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  dayWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  dayChipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  dayChipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
}));
