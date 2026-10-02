import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { NoteGlyph } from '@/components/motifs';
import { Text } from '@/components/text';
import { Sheet } from '@/components/ui';
import { GLYPH } from '@/lib/engrave';
import { keyDisplayName, NOTE_VALUES } from '@/lib/melody';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

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
  const { fs } = useTheme();
  const goal = Math.max(1, store.dailyGoal);
  // the marks are Bravura through SVG, the same glyphs the staff draws: in a
  // Text, Android drops the heads off Noto Music's notes (see MetNote)
  const em = fs(40);

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
              <NoteGlyph head={v.head} dotted={v.dotted} size={fs(28)} color={C.ink} />
            </View>
            <Text style={s.valueMin}>{store.t('home.staffLegend.aboutMin', { min: Math.round(v.f * goal) })}</Text>
          </View>
        ))}
      </View>

      <Text style={s.head}>{store.t('home.staffLegend.marksHead')}</Text>
      <View style={s.markRow}>
        <View style={s.glyphBox}>
          {/* a whole rest, hung from its line, as every day off on the staff is */}
          <Svg width={0.282 * em + 8} height={0.2 * em}>
            <Rect x={0} y={0.05 * em} width={0.282 * em + 8} height={1} fill={C.staffLine} />
            <SvgText x={4} y={0.05 * em} fontFamily={F.smufl} fontSize={em} fill={C.ink}>
              {GLYPH.restWhole}
            </SvgText>
          </Svg>
        </View>
        <Text style={s.markText}>{store.t('home.staffLegend.rest')}</Text>
      </View>
      <View style={s.markRow}>
        <View style={s.glyphBox}>
          <Svg width={0.61 * em} height={0.34 * em}>
            <SvgText x={0} y={0.335 * em} fontFamily={F.smufl} fontSize={em} fill={C.ink}>
              {GLYPH.fermataAbove}
            </SvgText>
          </Svg>
        </View>
        <Text style={s.markText}>{store.t('home.staffLegend.fermata')}</Text>
      </View>

      <Text style={s.head}>{store.t('home.staffLegend.meterHead')}</Text>
      <Text style={s.body}>{store.t('home.staffLegend.meter')}</Text>

      <Text style={s.foot}>{store.t('home.staffLegend.key', { key: store.t('settings.majorKey', { key: keyDisplayName(store.melodyKey, store.lang) }) })}</Text>
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
  glyphBox: { width: 40, minHeight: 34, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  valueMin: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  markText: { flex: 1, fontFamily: F.body, fontSize: fs(14), lineHeight: fs(20), color: C.ink },
  foot: { fontFamily: F.body, fontSize: fs(13), lineHeight: fs(18), color: C.tertiary, marginTop: 22, marginBottom: 8 },
}));
