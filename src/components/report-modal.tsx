// Teacher export (#99): a shareable practice report — the boring version of the
// recap card. A 700×990 portrait page (white paper whatever the theme, like the
// recap keeps its cream) with the period's minutes by day, a per-piece table and
// the session notes, captured at 2× to a PNG through the same view-shot +
// expo-sharing pipeline the recap card uses. The numbers come from
// lib/report-math.ts; this file only formats them.
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { LogoMark, ShareIcon } from '@/components/icons';
import { Pressable } from '@/components/press';
import { RecapModal } from '@/components/recap-card';
import { Text } from '@/components/text';
import { EntryRow, Sheet } from '@/components/ui';
import { reportData, type ReportData } from '@/lib/report-math';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

// the page: fixed size and print-like colours, independent of theme and font scale
const PAGE_W = 700;
const PAGE_H = 990;
const PAD = 44;
const PAPER = '#FFFFFF';
const INK = '#1C1A17';
const SUB = '#6E675C';
const RULE = '#E6E1D8';
const BAR = '#EFEAE0';
const ACCENT = '#B34A2E';

type Kind = 'week' | 'month';

/**
 * The share chooser (#99): recap card or practice report. Owns both modals, so
 * a screen needs one button and one line.
 */
export function ShareSheet({ visible, onClose, piece }: { visible: boolean; onClose: () => void; piece?: string }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [open, setOpen] = useState<'recap' | 'report' | null>(null);
  const pick = (what: 'recap' | 'report') => {
    onClose();
    setOpen(what);
  };
  return (
    <>
      <Sheet visible={visible} onClose={onClose} contentStyle={{ gap: 6 }}>
        <Text style={s.chooserTitle}>{store.t('report.chooserTitle')}</Text>
        <EntryRow
          testID="share-recap"
          keySize={44}
          keyStyle={{ backgroundColor: C.accentTint }}
          keyContent={<LogoMark size={22} />}
          title={store.t('report.recapCard')}
          subline={store.t('report.recapCardSub')}
          onPress={() => pick('recap')}
        />
        <EntryRow
          testID="share-report"
          keySize={44}
          keyStyle={{ backgroundColor: C.track }}
          keyContent={<ShareIcon size={18} />}
          title={store.t('report.practiceReport')}
          subline={store.t('report.practiceReportSub')}
          close
          onPress={() => pick('report')}
        />
      </Sheet>
      <RecapModal visible={open === 'recap'} onClose={() => setOpen(null)} />
      <ReportModal visible={open === 'report'} onClose={() => setOpen(null)} piece={piece} />
    </>
  );
}

/** The report modal: week/month toggle, a scaled live preview of the page, and Share. `piece` narrows it to one piece. */
export function ReportModal({ visible, onClose, piece }: { visible: boolean; onClose: () => void; piece?: string }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const { width: winW } = useWindowDimensions();
  const [kind, setKind] = useState<Kind>('week');
  const shotRef = useRef<View>(null);

  if (!visible) return null;

  const data = reportData({
    sessions: store.sessions,
    minutesByDate: store.minutesByDate,
    pieces: store.allPieces,
    period: { kind, anchor: store.today },
    weekStart: store.weekStart,
    pieceFilter: piece,
  });

  // the page is laid out at full size and scaled down for the preview; the
  // capture reads the unscaled view, so the PNG is always 1400×1980
  const avail = Math.max(240, winW - 2 * 20 - 2 * 20);
  const scale = avail / PAGE_W;

  const share = async () => {
    if (!data) return;
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile', width: PAGE_W * 2, height: PAGE_H * 2 });
      if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(`file://${uri.replace(/^file:\/\//, '')}`);
      else store.showToast(store.t('recap.sharingUnavailable'));
    } catch {
      store.showToast(store.t('recap.imageFailed'));
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={s.segTrack}>
              {(['week', 'month'] as Kind[]).map((k) => (
                <Pressable key={k} testID={`report-period-${k}`} style={[s.segBtn, kind === k && s.segBtnSel]} onPress={() => setKind(k)}>
                  <Text style={[s.segText, kind === k && { color: C.ink }]}>{store.t(k === 'week' ? 'report.week' : 'report.month')}</Text>
                </Pressable>
              ))}
            </View>

            <View testID="report-preview" style={{ width: avail, height: Math.round(PAGE_H * scale), overflow: 'hidden', borderRadius: 6, borderWidth: 1, borderColor: C.cardBorder }}>
              <View ref={shotRef} collapsable={false} style={{ width: PAGE_W, height: PAGE_H, transform: [{ scale }], transformOrigin: 'top left' }}>
                <ReportPage data={data} kind={kind} piece={piece} />
              </View>
            </View>

            {!data && <Text style={s.emptyLine}>{store.t('report.empty')}</Text>}

            <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
              <Pressable style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeText}>{store.t('recap.close')}</Text>
              </Pressable>
              <Pressable testID="report-share" style={[s.shareBtn, !data && { opacity: 0.4 }]} disabled={!data} onPress={share}>
                <Text style={s.shareText}>{store.t('report.share')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const fmtMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim() : `${min} min`);
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The page itself — fixed geometry, no fs()/r(), so the capture is deterministic. */
function ReportPage({ data, kind, piece }: { data: ReportData | null; kind: Kind; piece?: string }) {
  const store = useStore();
  const lang = store.lang;
  const fmt = (key: string, opts: Intl.DateTimeFormatOptions) => dateOf(key).toLocaleDateString(lang, opts);
  const range = data?.range;
  const periodLabel = range
    ? kind === 'week'
      ? `${fmt(range.start, { month: 'short', day: 'numeric' })} – ${fmt(range.end, { month: 'short', day: 'numeric' })}`
      : fmt(range.start, { month: 'long', year: 'numeric' })
    : '';
  const perDay = data?.perDay ?? [];
  const max = Math.max(1, ...perDay.map((d) => d.min));
  const chartW = PAGE_W - 2 * PAD;
  const chartH = 96;
  const n = Math.max(1, perDay.length);
  const slot = chartW / n;
  // week: every weekday; month: the 1st and every seventh day after it
  const labelled = perDay.map((_, i) => kind === 'week' || i % 7 === 0);
  const tempoText = (d: number | null) => (d === null ? '—' : d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');

  return (
    <View style={p.page}>
      <View style={p.headRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={p.title}>{store.t('report.title')}</Text>
          <Text style={p.period}>
            {periodLabel}
            {piece ? ` · ${piece}` : ''}
          </Text>
          {!!store.name && <Text style={p.student}>{store.name}</Text>}
        </View>
        <View style={p.brand}>
          <LogoMark size={30} />
          <Text style={p.wordmark}>Étude</Text>
        </View>
      </View>

      {data && (
        <>
          <View style={p.totals}>
            <Total value={fmtMin(data.totalMin)} />
            <Total value={store.t('report.days', { n: data.days, count: data.days })} />
            <Total value={store.t('report.sessions', { n: data.sessionCount, count: data.sessionCount })} />
            {!piece && store.displayStreak > 0 && <Total value={store.t('report.streak', { n: store.displayStreak })} />}
          </View>

          <Text style={p.section}>{store.t('report.minutesByDay')}</Text>
          <Svg width={chartW} height={chartH}>
            {perDay.map((d, i) => {
              const h = d.min > 0 ? Math.max(3, (d.min / max) * (chartH - 4)) : 2;
              return <Rect key={d.date} x={i * slot + slot * 0.12} y={chartH - h} width={slot * 0.76} height={h} rx={2} fill={d.min > 0 ? ACCENT : BAR} />;
            })}
          </Svg>
          <View style={{ height: 16, position: 'relative' }}>
            {perDay.map((d, i) =>
              labelled[i] ? (
                <Text key={d.date} style={[p.axis, { position: 'absolute', left: i * slot, width: slot }]} numberOfLines={1}>
                  {kind === 'week' ? fmt(d.date, { weekday: 'narrow' }) : String(dateOf(d.date).getDate())}
                </Text>
              ) : null,
            )}
          </View>

          <Text style={p.section}>{store.t('report.pieces')}</Text>
          <View style={[p.row, p.rowHead]}>
            <Text style={[p.cellName, p.th]}>{store.t('report.pieces')}</Text>
            <Text style={[p.cell, p.th]}>{store.t('report.minutes')}</Text>
            <Text style={[p.cell, p.th]}>{store.t('report.sessionsCol')}</Text>
            <Text style={[p.cell, p.th]}>{store.t('report.tempo')}</Text>
            <Text style={[p.cell, p.th]}>{store.t('report.rating')}</Text>
          </View>
          {data.pieceRows.map((r) => (
            <View key={r.name} style={p.row}>
              <View style={p.cellName}>
                <Text style={p.td} numberOfLines={1}>
                  {r.name}
                </Text>
                {r.spotSessions > 0 && <Text style={p.tdSub}>{store.t('report.spotSessions', { n: r.spotSessions, count: r.spotSessions })}</Text>}
              </View>
              <Text style={[p.cell, p.td]}>{r.min}</Text>
              <Text style={[p.cell, p.td]}>{r.sessions}</Text>
              <Text style={[p.cell, p.td, r.tempoDelta !== null && r.tempoDelta > 0 && { color: ACCENT }]}>{tempoText(r.tempoDelta)}</Text>
              <Text style={[p.cell, p.td]}>{r.avgRating === null ? '—' : `★ ${r.avgRating.toFixed(1)}`}</Text>
            </View>
          ))}
          {data.morePieces > 0 && <Text style={p.more}>{store.t('report.andMore', { n: data.morePieces })}</Text>}

          {data.notes.length > 0 && (
            <>
              <Text style={p.section}>{store.t('report.notes')}</Text>
              {data.notes.map((nt, i) => (
                <View key={`${nt.date}-${i}`} style={p.noteRow}>
                  <Text style={p.noteDate}>{fmt(nt.date, { weekday: 'short', day: 'numeric' })}</Text>
                  <Text style={p.noteText}>
                    <Text style={p.noteFocus}>{nt.focus}</Text>
                    {' — '}
                    {nt.note}
                  </Text>
                </View>
              ))}
              {data.moreNotes > 0 && <Text style={p.more}>{store.t('report.andMore', { n: data.moreNotes })}</Text>}
            </>
          )}
        </>
      )}
      {!data && <Text style={p.emptyPage}>{store.t('report.empty')}</Text>}

      <Text style={p.footer}>
        {store.t('report.generated')} · {fmt(store.today, { year: 'numeric', month: 'short', day: 'numeric' })}
      </Text>
    </View>
  );
}

function Total({ value }: { value: string }) {
  return (
    <View style={p.total}>
      <Text style={p.totalValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// the page's own styles: literal sizes and colours, never themed
const p = StyleSheet.create({
  page: { width: PAGE_W, height: PAGE_H, backgroundColor: PAPER, padding: PAD, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 },
  title: { fontFamily: F.head, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: INK },
  period: { fontFamily: F.bodyMed, fontSize: 17, color: ACCENT, marginTop: 4 },
  student: { fontFamily: F.body, fontSize: 15, color: SUB, marginTop: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  wordmark: { fontFamily: F.head, fontSize: 18, letterSpacing: -0.2, color: INK },
  totals: { flexDirection: 'row', gap: 12, marginTop: 24 },
  total: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: BAR },
  totalValue: { fontFamily: F.bodySemi, fontSize: 16, color: INK },
  section: { fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: SUB, marginTop: 26, marginBottom: 8 },
  axis: { fontFamily: F.body, fontSize: 10.5, color: SUB, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: RULE },
  rowHead: { borderTopWidth: 0, paddingVertical: 4 },
  cellName: { flex: 2.4, minWidth: 0, paddingRight: 8 },
  cell: { flex: 1, textAlign: 'right' },
  th: { fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: SUB },
  td: { fontFamily: F.bodyMed, fontSize: 14.5, color: INK },
  tdSub: { fontFamily: F.body, fontSize: 11.5, color: SUB, marginTop: 1 },
  more: { fontFamily: F.body, fontSize: 12.5, color: SUB, marginTop: 6 },
  noteRow: { flexDirection: 'row', gap: 12, paddingVertical: 5 },
  noteDate: { width: 64, fontFamily: F.bodySemi, fontSize: 12.5, color: SUB, paddingTop: 1 },
  noteText: { flex: 1, fontFamily: F.accent, fontSize: 14, lineHeight: 19, color: INK },
  noteFocus: { fontFamily: F.bodyMed, fontSize: 13.5, color: INK },
  emptyPage: { fontFamily: F.body, fontSize: 15, color: SUB, marginTop: 40 },
  footer: { position: 'absolute', left: PAD, right: PAD, bottom: 28, fontFamily: F.body, fontSize: 11.5, color: SUB },
});

const useS = themed(({ C, fs, r }: T) =>
  StyleSheet.create({
    chooserTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink, marginBottom: 6 },
    backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.55)', justifyContent: 'center', padding: 20 },
    sheet: { backgroundColor: C.card, borderRadius: r(22), padding: 20, maxHeight: '92%' },
    segTrack: { flexDirection: 'row', backgroundColor: C.track, borderRadius: r(999), padding: 2.5, alignSelf: 'center' },
    segBtn: { height: 30, paddingHorizontal: 18, borderRadius: r(999), alignItems: 'center', justifyContent: 'center' },
    segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    segText: { fontFamily: F.bodySemi, fontSize: fs(12.5), color: C.sub },
    emptyLine: { fontFamily: F.body, fontSize: fs(13.5), color: C.sub },
    closeBtn: { flex: 1, height: 48, borderRadius: r(14), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.ink },
    shareBtn: { flex: 1.4, height: 48, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    shareText: { fontFamily: F.bodySemi, fontSize: fs(15), color: '#FFFFFF' },
  }),
);
