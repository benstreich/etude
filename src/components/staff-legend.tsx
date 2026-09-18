import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Sheet } from '@/components/ui';
import { NOTE_VALUES } from '@/lib/melody';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

/**
 * What the staff on Home means, for the person reading it. The note values are
 * drawn from the same table the staff itself uses (lib/melody.ts) and spelled out
 * in minutes against the reader's own goal, so the legend can never drift from
 * what is on the staff above it.
 */
export function StaffLegend({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const goal = Math.max(1, store.dailyGoal);

  return (
    <Sheet visible={visible} onClose={onClose} grabber>
      <Text style={s.title}>{store.t('home.staffLegend.title')}</Text>
      <Text style={s.intro}>{store.t('home.staffLegend.intro')}</Text>

      <Text style={s.head}>{store.t('home.staffLegend.pitchHead')}</Text>
      <Text style={s.body}>{store.t('home.staffLegend.pitch')}</Text>

      <Text style={s.head}>{store.t('home.staffLegend.lengthHead')}</Text>
      <Text style={s.body}>{store.t('home.staffLegend.length', { goal })}</Text>
      <View style={s.values}>
        {/* longest first: the goal met in one sitting reads as the headline, the fragments under it */}
        {[...NOTE_VALUES].reverse().map((v) => (
          <View key={`${v.glyph}${v.dotted}`} style={s.valueRow}>
            <View style={s.glyphBox}>
              <Text style={s.glyph}>{v.glyph}</Text>
              {v.dotted && <View style={[s.dot, { backgroundColor: C.ink }]} />}
            </View>
            <Text style={s.valueMin}>{store.t('home.staffLegend.aboutMin', { min: Math.round(v.f * goal) })}</Text>
          </View>
        ))}
      </View>

      <Text style={s.head}>{store.t('home.staffLegend.marksHead')}</Text>
      <View style={s.markRow}>
        <View style={s.glyphBox}>
          <Text style={s.glyph}>{'\u{1D13D}'}</Text>
        </View>
        <Text style={s.markText}>{store.t('home.staffLegend.rest')}</Text>
      </View>
      <View style={s.markRow}>
        <View style={s.glyphBox}>
          <Text style={s.glyph}>{'\u{1D110}'}</Text>
        </View>
        <Text style={s.markText}>{store.t('home.staffLegend.fermata')}</Text>
      </View>

      <Text style={s.head}>{store.t('home.staffLegend.meterHead')}</Text>
      <Text style={s.body}>{store.t('home.staffLegend.meter')}</Text>

      <Text style={s.foot}>{store.t('home.staffLegend.key', { key: store.t('settings.majorKey', { key: store.melodyKey }) })}</Text>
    </Sheet>
  );
}

const useS = themed(({ C, fs }: T) => StyleSheet.create({
  title: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  intro: { fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.sub, marginTop: 8 },
  head: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase', color: C.tertiary, marginTop: 22 },
  body: { fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.ink, marginTop: 6 },
  values: { marginTop: 10, gap: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // the notation font hangs its glyphs well below the baseline, so the box is
  // taller than the text and the row centres on the note head, not on the stem
  glyphBox: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  glyph: { fontFamily: F.notation, fontSize: fs(26), lineHeight: fs(34), color: C.ink },
  dot: { width: 4, height: 4, borderRadius: 2, marginLeft: 2, marginTop: 6 },
  valueMin: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  markText: { flex: 1, fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.ink },
  foot: { fontFamily: F.body, fontSize: fs(13), lineHeight: fs(18), color: C.tertiary, marginTop: 22, marginBottom: 8 },
}));
