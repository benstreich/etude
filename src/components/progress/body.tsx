import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Pressable } from '@/components/press';

import { EditSessionSheet } from '@/components/edit-session';
import { ProgressLayoutSheet } from '@/components/progress-layout-sheet';
import { Text } from '@/components/text';
import { Card, InstrumentFilter, Overline, useInstrumentFilter } from '@/components/ui';
import { resolveLayout } from '@/lib/progress-sections';
import { Session, useStore } from '@/lib/store';
import { useC } from '@/lib/theme';

import { SECTIONS } from './sections';
import { useS } from './styles';
import type { SectionProps } from './types';

/**
 * The progress section list: filters once, resolves the user's layout, renders
 * every section that is switched on. Lives on Home (and the hidden /progress route).
 */
export function ProgressBody({ header, showEmpty = true }: { header?: React.ReactNode; showEmpty?: boolean }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const [editSess, setEditSess] = useState<Session | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);

  // #58: one instrument's slice of the log; sections re-derive their daily minutes from the filtered sessions
  const inst = useInstrumentFilter();
  const sessions = inst ? store.sessions.filter((x) => x.instrument === inst) : store.sessions;
  const mbd = inst ? sessions.reduce<Record<string, number>>((a, x) => ((a[x.date] = (a[x.date] ?? 0) + x.min), a), {}) : store.minutesByDate;
  const pieces = store.pieces.filter((p) => !p.archived && (!inst || !p.instrument || p.instrument === inst));
  const empty = store.totalMin === 0 && sessions.length === 0;
  const monday = store.weekStart === 'Monday';

  // sections that cut by time carry their own 7d/30d/All picker (period.tsx); the heatmap and volume stay calendar-based
  const props: SectionProps = { sessions, pieces, mbd, inst, monday, onEditSession: setEditSess };
  const layout = resolveLayout(store.progressLayout);

  return (
    <>
      {header}
      {!store.progressHintSeen && !empty && (
        <View style={s.hint}>
          <Text style={s.hintText}>{store.t('progress.customHint')}</Text>
          <Pressable hitSlop={8} onPress={() => store.updateSettings({ progressHintSeen: true })}>
            <Text style={s.hintBtn}>{store.t('progress.hintDismiss')}</Text>
          </Pressable>
        </View>
      )}
      {/* the layout button lives in Home's header now; the Customise link below still opens the sheet here */}
      {!empty && <InstrumentFilter />}

      {/* Home draws its own week staff and Start row, so it opts out of this placeholder */}
      {empty && !showEmpty ? null : empty ? (
        <Card>
          <Overline style={{ marginBottom: 16 }}>{store.t('progress.last7Days')}</Overline>
          <View style={s.chart}>
            {[22, 48, 30, 64, 40, 78, 55].map((h, i) => (
              <View key={i} style={s.col}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View style={{ height: `${h}%`, backgroundColor: i === 6 ? C.accentTint : C.track, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
                </View>
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'center', gap: 6, marginTop: 18 }}>
            <Text style={s.emptyTitle}>{store.t('progress.emptyTitle')}</Text>
            <Text style={s.emptyText}>{store.t('progress.emptyText')}</Text>
            <Pressable style={s.tintBtn} onPress={() => router.push('/practice')}>
              <Text style={s.tintBtnText}>{store.t('progress.startPracticing')}</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        layout
          .filter((l) => l.on)
          .map((l) => {
            const Section = SECTIONS[l.key];
            return Section ? <Section key={l.key} {...props} /> : null;
          })
      )}

      <Pressable style={s.customise} hitSlop={8} onPress={() => setLayoutOpen(true)}>
        <Text style={s.customiseText}>{store.t('progress.customise')}</Text>
      </Pressable>

      <ProgressLayoutSheet visible={layoutOpen} onClose={() => setLayoutOpen(false)} />

      <EditSessionSheet session={editSess} onClose={() => setEditSess(null)} />
    </>
  );
}

