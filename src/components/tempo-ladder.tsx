// Tempo ladder (#17) — per-piece BPM log with a small line chart, a delta
// chip for the month, and a stepper sheet to log today's tempo.
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { MetronomeButton } from '@/components/metronome';
import { Card, Overline } from '@/components/ui';
import { tempoDelta } from '@/lib/growth-math';
import { MAX_BPM } from '@/lib/metronome-math';
import { dayLabel, Piece, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const CHART_H = 96;

function TempoChart({ log, target }: { log: { date: string; bpm: number }[]; target?: number }) {
  const C = useC();
  const s = useS();
  const store = useStore();
  const [w, setW] = useState(0);
  const values = log.map((e) => e.bpm);
  const hi = Math.max(...values, target ?? 0);
  const lo = Math.min(...values, target ?? Infinity);
  const pad = Math.max(4, (hi - lo) * 0.15);
  const y = (bpm: number) => 6 + (CHART_H - 12) * (1 - (bpm - (lo - pad)) / (hi + pad - (lo - pad)));
  const x = (i: number) => (log.length === 1 ? w / 2 : 10 + ((w - 20) * i) / (log.length - 1));
  const points = log.map((e, i) => `${x(i)},${y(e.bpm)}`).join(' ');
  const last = log[log.length - 1];
  // one label where each month first appears
  const labels = log
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => i === 0 || e.date.slice(0, 7) !== log[i - 1].date.slice(0, 7))
    .slice(-4);
  const monthName = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1).toLocaleDateString(store.lang, { month: 'short' });
  return (
    <View onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={CHART_H}>
          {!!target && (
            <Line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke={C.cardBorder} strokeWidth={1.5} strokeDasharray="5 4" />
          )}
          {log.length > 1 && (
            <Polyline points={points} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          <Circle cx={x(log.length - 1)} cy={y(last.bpm)} r={4.5} fill={C.accent} stroke={C.card} strokeWidth={2} />
        </Svg>
      )}
      <View style={s.axisRow}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {labels.map(({ e }) => (
            <Text key={e.date} style={s.axisText}>
              {monthName(e.date)}
            </Text>
          ))}
        </View>
        {!!target && <Text style={s.axisText}>{store.t('tempoLadder.axisTarget', { target })}</Text>}
      </View>
    </View>
  );
}

export function TempoLadder({ piece }: { piece: Piece }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const [logOpen, setLogOpen] = useState(false);
  const log = piece.tempoLog ?? [];
  const last = log[log.length - 1];
  const [draft, setDraft] = useState(0);

  const openLog = () => {
    setDraft(last?.bpm ?? piece.currentBpm ?? piece.targetBpm ?? 90);
    setLogOpen(true);
  };
  const save = () => {
    store.logTempo(piece.id, draft);
    setLogOpen(false);
  };
  const delta = tempoDelta(log, store.today);

  if (log.length === 0)
    return (
      <Pressable onPress={openLog}>
        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={s.ghostGlyph}>♩=</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.ghostTitle}>{store.t('tempoLadder.title')}</Text>
            <Text style={s.ghostSub}>{store.t('tempoLadder.emptyHint')}</Text>
          </View>
        </Card>
        <LogSheet visible={logOpen} draft={draft} setDraft={setDraft} onSave={save} onClose={() => setLogOpen(false)} />
      </Pressable>
    );

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ padding: 16, gap: 14 }}>
        <View style={s.headRow}>
          <Overline>{store.t('tempoLadder.title')}</Overline>
          {!!piece.targetBpm && <Text style={s.targetText}>{store.t('tempoLadder.targetBpm', { bpm: piece.targetBpm })}</Text>}
        </View>
        <View style={s.heroRow}>
          <View>
            <Text style={s.heroBpm}>{last.bpm}</Text>
            <Text style={s.heroCaption}>{store.t('tempoLadder.bpmNow')}</Text>
          </View>
          {delta > 0 && (
            <View style={s.deltaChip}>
              <Text style={s.deltaText}>{store.t('tempoLadder.deltaThisMonth', { delta })}</Text>
            </View>
          )}
        </View>
        <TempoChart log={log} target={piece.targetBpm} />
        <View style={s.footRow}>
          <Pressable style={s.tintBtn} onPress={openLog}>
            <Text style={s.tintBtnText}>{store.t('tempoLadder.logTodaysTempo')}</Text>
          </Pressable>
          <MetronomeButton compact presetBpm={last.bpm} />
        </View>
      </Card>

      {log.length > 1 && (
        <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          {[...log].reverse().slice(0, 5).map((e, i) => (
            <View key={e.date} style={[s.entryRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}>
              <Text style={s.entryDate}>{dayLabel(e.date, store.today, store.t, store.lang)}</Text>
              <Text style={s.entryBpm}>{e.bpm} BPM</Text>
              <Pressable hitSlop={8} onPress={() => store.deleteTempoEntry(piece.id, e.date)}>
                <Text style={s.entryDelete}>{store.t('tempoLadder.delete')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <LogSheet visible={logOpen} draft={draft} setDraft={setDraft} onSave={save} onClose={() => setLogOpen(false)} />
    </View>
  );
}

function LogSheet({
  visible,
  draft,
  setDraft,
  onSave,
  onClose,
}: {
  visible: boolean;
  draft: number;
  setDraft: (fn: (v: number) => number) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const s = useS();
  const { t } = useStore();
  const bump = (d: number) => setDraft((v) => Math.min(MAX_BPM, Math.max(20, v + d)));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.sheetTitle}>{t('tempoLadder.todaysTempo')}</Text>
          <View style={s.stepRow}>
            {[-5, -1].map((d) => (
              <Pressable key={d} style={s.stepBtn} hitSlop={6} onPress={() => bump(d)}>
                <Text style={s.stepText}>{d}</Text>
              </Pressable>
            ))}
            <View style={{ alignItems: 'center', minWidth: 96 }}>
              <Text style={s.sheetBpm}>{draft}</Text>
              <Text style={s.sheetUnit}>BPM</Text>
            </View>
            {[1, 5].map((d) => (
              <Pressable key={d} style={s.stepBtn} hitSlop={6} onPress={() => bump(d)}>
                <Text style={s.stepText}>+{d}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={s.saveBtn} onPress={onSave}>
            <Text style={s.saveText}>{t('tempoLadder.logTempo')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetText: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBpm: { fontFamily: F.head, fontSize: fs(34), color: C.accent, lineHeight: fs(38) },
  heroCaption: { fontFamily: F.body, fontSize: fs(12), color: C.sub },
  deltaChip: { backgroundColor: C.successTint, borderRadius: r(999), paddingVertical: 6, paddingHorizontal: 12 },
  deltaText: { fontFamily: F.bodySemi, fontSize: fs(12.5), color: C.success },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontFamily: F.body, fontSize: fs(10.5), color: C.tertiary },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 14 },
  tintBtn: { flex: 1, height: 42, borderRadius: r(12), backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' },
  tintBtnText: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.accent },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48 },
  entryDate: { flex: 1, fontFamily: F.bodyMed, fontSize: fs(14), color: C.ink },
  entryBpm: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.sub },
  entryDelete: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.accent },
  ghostGlyph: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.sub },
  ghostTitle: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
  ghostSub: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 18 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 46, height: 46, borderRadius: r(23), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(14), color: C.ink },
  sheetBpm: { fontFamily: F.head, fontSize: fs(44), color: C.ink, fontVariant: ['tabular-nums'], lineHeight: fs(48) },
  sheetUnit: { fontFamily: F.bodySemi, fontSize: fs(11), letterSpacing: 1.4, color: C.tertiary },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
