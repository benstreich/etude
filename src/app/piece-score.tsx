// The imported score (#92): a piece's MusicXML, engraved in Bravura the way the
// practice log's full score is, wrapped into systems down the page. Clef and
// key on every system, the meter where it changes, ledger lines above and
// below, rests and accidentals in place. Read-only — no playback, no zoom.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { Pressable } from '@/components/press';
import { useImportXml } from '@/components/score';
import { Text } from '@/components/text';
import { BackLink } from '@/components/ui';
import {
  BAR_PAD,
  BEAM_T,
  CLEF_X,
  DOT_R,
  flagOrigin,
  GLYPH,
  glyphFontSize,
  headGlyph,
  headOrigin,
  headRx,
  KEY_COL_W,
  LEDGER_EXT,
  LINE_W,
  METER_COL_W,
  REST_HW,
  REST_X,
  restGlyph,
  signatureMarks,
  signatureMarksAt,
  STEM_W,
  yOf,
} from '@/lib/engrave';
import type { ScorePiece } from '@/lib/musicxml';
import { readScore } from '@/lib/score-file';
import { layoutScore, type ScoreSystem } from '@/lib/score-render';
import { useStore } from '@/lib/store';
import { F, themed, useTheme, type T } from '@/lib/theme';

// system geometry — SP is the one staff space everything else is a multiple of.
// The staff sits low enough in its block for two ledger lines and a stem above it.
const SP = 12;
const STAFF_TOP = 4 * SP;
const BLOCK_H = STAFF_TOP + 4 * SP + 4 * SP;
const RULES = [0, 1, 2, 3, 4].map((i) => STAFF_TOP + i * SP);
const LINE = LINE_W(SP);
const STEM = STEM_W(SP);
const NOTE_FS = glyphFontSize(SP);
const SYS_GAP = 10;
const PAGE_PAD = 20;

export default function PieceScore() {
  const s = useS();
  const { C } = useTheme();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const piece = store.allPieces.find((p) => p.id === id);
  // what was read, tagged with the import it belongs to — a re-import writes the
  // same path, so the tag (`scoreInfo.at`) is what tells a stale read from a fresh one
  const [loaded, setLoaded] = useState<{ at: number; score: ScorePiece | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // the file is read in an effect, never during render
  const file = piece?.scoreFile;
  const at = piece?.scoreInfo?.at ?? 0;
  useEffect(() => {
    if (!file) return;
    let live = true;
    readScore(file).then((sc) => {
      if (live) setLoaded({ at, score: sc });
    });
    return () => {
      live = false;
    };
  }, [file, at]);
  const score = loaded?.at === at ? loaded.score : null;

  const sysW = Math.max(160, winW - PAGE_PAD * 2);
  const measures = score?.parts[0]?.measures;
  const systems = useMemo(() => (measures ? layoutScore(measures, sysW, SP) : []), [measures, sysW]);

  // hooks above; the piece can go away under an open screen (removed, or its score taken off)
  const xml = useImportXml(piece ?? { id: '', name: '', by: '', stage: 0, pct: 0 });
  if (!piece || !piece.scoreFile) return null;

  const confirmRemove = () => {
    setMenuOpen(false);
    const doRemove = () => {
      router.back();
      store.removePieceScore(piece.id);
    };
    // ponytail: Alert.alert is a no-op on web; window.confirm covers it
    if (Platform.OS === 'web') {
      if (window.confirm(`${store.t('xmlScore.remove')} ${store.t('xmlScore.removeBody')}`)) doRemove();
      return;
    }
    Alert.alert(store.t('xmlScore.remove'), store.t('xmlScore.removeBody'), [
      { text: store.t('editSession.cancel'), style: 'cancel' },
      { text: store.t('xmlScore.remove'), style: 'destructive', onPress: doRemove },
    ]);
  };

  const title = score?.title ?? piece.scoreInfo?.title ?? piece.name;
  const bars = measures?.length ?? piece.scoreInfo?.bars ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 22 }]}>
        <View style={s.headRow}>
          <BackLink label={piece.name} onPress={() => router.back()} />
          <Pressable testID="piece-score-menu" hitSlop={8} accessibilityLabel={store.t('xmlScore.options')} onPress={() => setMenuOpen(true)}>
            <Text style={s.navGlyph}>⋯</Text>
          </Pressable>
        </View>
        <Text style={s.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {title !== piece.name ? `${piece.name} · ` : ''}
          {store.t('xmlScore.row', { n: bars })}
        </Text>
      </View>

      <ScrollView testID="piece-score-scroll" contentContainerStyle={{ paddingHorizontal: PAGE_PAD, paddingTop: 12, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {systems.map((sys, i) => (
          <SystemView key={i} sys={sys} isLast={i === systems.length - 1} />
        ))}
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              style={s.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                xml.importFile();
              }}>
              <Text style={s.sheetRowText}>{store.t('xmlScore.replace')}</Text>
            </Pressable>
            <Pressable testID="piece-score-remove" style={s.sheetRow} onPress={confirmRemove}>
              <Text style={[s.sheetRowText, { color: C.accent }]}>{store.t('xmlScore.remove')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** One system: clef, key signature, then every bar it holds. */
function SystemView({ sys, isLast }: { sys: ScoreSystem; isLast: boolean }) {
  const { C } = useTheme();
  const endX = sys.headW + sys.width;
  return (
    <View style={{ height: BLOCK_H, marginBottom: SYS_GAP }}>
      <Svg width={endX + 2} height={BLOCK_H}>
        {RULES.map((y) => (
          <Rect key={y} x={0} y={y} width={endX} height={LINE} fill={C.staffLine} />
        ))}
        <G transform={`translate(0, ${STAFF_TOP})`}>
          {/* Bravura's gClef sits on the G line by design — no empirical offset needed */}
          <SvgText x={CLEF_X(SP)} y={yOf(2, SP)} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
            {GLYPH.gClef}
          </SvgText>
          {signatureMarks(sys.sig, SP).map((m, i) => (
            <SvgText key={i} x={m.x} y={m.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
              {m.sharp ? GLYPH.accidentalSharp : GLYPH.accidentalFlat}
            </SvgText>
          ))}
        </G>
        {sys.bars.map((b, i) => {
          const barX = sys.headW + b.x;
          const meterW = b.meter ? METER_COL_W(b.meter.n, SP, b.meter.d) : 0;
          const keyW = b.keyChange !== null ? KEY_COL_W(b.keyChange, SP) : 0;
          const xOff = BAR_PAD(SP) + meterW + keyW;
          const final = isLast && i === sys.bars.length - 1;
          return (
            <G key={b.index} transform={`translate(${barX}, ${STAFF_TOP})`}>
              <Rect x={0} y={0} width={LINE * 1.2} height={4 * SP} fill={C.barline} />
              {b.meter && (
                <G>
                  <SvgText x={BAR_PAD(SP) + meterW / 2} y={yOf(6, SP)} textAnchor="middle" fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                    {GLYPH.timeSig(b.meter.n)}
                  </SvgText>
                  <SvgText x={BAR_PAD(SP) + meterW / 2} y={yOf(2, SP)} textAnchor="middle" fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                    {GLYPH.timeSig(b.meter.d)}
                  </SvgText>
                </G>
              )}
              {b.keyChange !== null &&
                signatureMarksAt(b.keyChange, BAR_PAD(SP) + meterW + 0.3 * SP, SP).map((m, k) => (
                  <SvgText key={`k${k}`} x={m.x} y={m.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                    {m.sharp ? GLYPH.accidentalSharp : GLYPH.accidentalFlat}
                  </SvgText>
                ))}
              <G transform={`translate(${xOff}, 0)`}>
                {!b.lay && (
                  <SvgText x={REST_X(SP)} y={SP} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                    {GLYPH.restWhole}
                  </SvgText>
                )}
                {b.lay?.beams.map((bm, k) => (
                  <Polygon
                    key={`bm${k}`}
                    points={`${bm.x1},${bm.y1} ${bm.x2},${bm.y2} ${bm.x2},${bm.y2 + (bm.down ? -BEAM_T(SP) : BEAM_T(SP))} ${bm.x1},${bm.y1 + (bm.down ? -BEAM_T(SP) : BEAM_T(SP))}`}
                    fill={C.ink}
                  />
                ))}
                {b.lay?.notes.map((n) => {
                  if (n.rest) {
                    return (
                      <G key={n.id}>
                        <SvgText x={n.x - REST_HW * SP} y={n.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                          {restGlyph(n.head)}
                        </SvgText>
                        {n.dot && <Circle cx={n.dot.x} cy={n.dot.y} r={DOT_R(SP)} fill={C.ink} />}
                      </G>
                    );
                  }
                  const head = headOrigin(n.head, n.x, n.y, SP);
                  const flag = n.flag && n.stem ? flagOrigin(n.down, n.stem.x + (n.down ? 0 : STEM), n.stem.y2, SP) : null;
                  const ledgerHalf = headRx(n.head, SP) + LEDGER_EXT * SP;
                  return (
                    <G key={n.id}>
                      {n.ledger.map((ly) => (
                        <Rect key={ly} x={n.x - ledgerHalf} y={ly - LINE * 0.6} width={ledgerHalf * 2} height={LINE * 1.2} fill={C.ink} />
                      ))}
                      {n.stem && <Rect x={n.stem.x} y={Math.min(n.stem.y1, n.stem.y2)} width={STEM} height={Math.abs(n.stem.y2 - n.stem.y1)} fill={C.ink} />}
                      {flag && (
                        <SvgText x={flag.x} y={flag.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                          {n.down ? GLYPH.flag8thDown : GLYPH.flag8thUp}
                        </SvgText>
                      )}
                      {n.acc && (
                        <SvgText x={n.acc.x} y={n.acc.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                          {n.acc.glyph}
                        </SvgText>
                      )}
                      <SvgText x={head.x} y={head.y} fontFamily={F.smufl} fontSize={NOTE_FS} fill={C.ink}>
                        {headGlyph(n.head)}
                      </SvgText>
                      {n.dot && <Circle cx={n.dot.x} cy={n.dot.y} r={DOT_R(SP)} fill={C.ink} />}
                    </G>
                  );
                })}
              </G>
              {/* the system's closing barline; the score's last one is the double bar */}
              {i === sys.bars.length - 1 &&
                (final ? (
                  <G>
                    <Rect x={b.width - 0.6 * SP} y={0} width={LINE * 1.2} height={4 * SP} fill={C.barline} />
                    <Rect x={b.width - 0.28 * SP} y={0} width={0.28 * SP} height={4 * SP} fill={C.ink} />
                  </G>
                ) : (
                  <Rect x={b.width - LINE * 1.2} y={0} width={LINE * 1.2} height={4 * SP} fill={C.barline} />
                ))}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.hairline },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    navGlyph: { fontSize: fs(20), color: C.sub, letterSpacing: 2 },
    title: { marginTop: 12, fontFamily: F.head, fontSize: fs(28), lineHeight: fs(32), letterSpacing: -0.4, color: C.ink },
    meta: { marginTop: 4, fontFamily: F.body, fontSize: fs(14), color: C.subStrong },
    backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
    // the same sheet the piece page's ⋯ menu uses, so the two read as one control
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 14 },
    sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink, marginBottom: 4 },
    sheetRow: { height: 52, justifyContent: 'center' },
    sheetRowText: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  })
);
