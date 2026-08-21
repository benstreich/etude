// Practice plan builder (#17) — edits write straight to the store, like the
// rest of the app; "Save plan" is just the way out.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayIcon } from '@/components/icons';
import { PlanSegment, useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const MAX_SEG_BPM = 300;

export default function PlanBuilder() {
  const s = useS();
  const C = useC();
  const store = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // editIdx: index of the segment being edited; -1 = adding a new one; null = sheet closed
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<PlanSegment | null>(null);

  const plan = store.plans.find((p) => p.id === id);
  if (!plan) return null; // deleted while open — back nav already left

  const totalMin = plan.segments.reduce((a, x) => a + x.min, 0);
  const setSegments = (segments: PlanSegment[]) => store.updatePlan(plan.id, { segments });

  const focusOptions: { name: string; kind: 'Piece' | 'Technique' }[] = [
    ...store.pieces.filter((p) => !p.archived).map((p) => ({ name: p.name, kind: 'Piece' as const })),
    ...store.techniques.map((t) => ({ name: t, kind: 'Technique' as const })),
  ];

  const openEdit = (idx: number) => {
    setDraft(idx === -1 ? { focus: focusOptions[0], min: 10 } : { ...plan.segments[idx] });
    setEditIdx(idx);
  };
  const closeEdit = () => {
    setEditIdx(null);
    setDraft(null);
  };
  const saveEdit = () => {
    if (editIdx === null || !draft?.focus) return;
    const next = [...plan.segments];
    if (editIdx === -1) next.push(draft);
    else next[editIdx] = draft;
    setSegments(next);
    closeEdit();
  };
  const move = (dir: -1 | 1) => {
    if (editIdx === null || editIdx === -1) return;
    const to = editIdx + dir;
    if (to < 0 || to >= plan.segments.length) return;
    const next = [...plan.segments];
    [next[editIdx], next[to]] = [next[to], next[editIdx]];
    setSegments(next);
    setEditIdx(to);
  };
  const removeSegment = () => {
    if (editIdx === null || editIdx === -1) return;
    setSegments(plan.segments.filter((_, i) => i !== editIdx));
    closeEdit();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 16 }]}>
        <View style={s.navRow}>
          <Pressable style={s.navBtn} onPress={() => router.back()} hitSlop={8}>
            <Text style={s.navGlyph}>‹</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Text style={s.saveLink}>{store.t('plan.savePlan')}</Text>
          </Pressable>
        </View>

        <TextInput
          style={s.title}
          value={plan.name}
          onChangeText={(name) => store.updatePlan(plan.id, { name })}
          placeholder={store.t('plan.planName')}
          placeholderTextColor={C.tertiary}
        />
        <Text style={s.meta}>
          {store.t('plan.segmentCount', { count: plan.segments.length })} · {store.t('plan.minTotal', { min: totalMin })}
        </Text>

        <View style={{ gap: 10, marginTop: 20 }}>
          {plan.segments.map((seg, i) => (
            <Pressable key={i} style={s.segCard} onPress={() => openEdit(i)}>
              <Text style={s.handle}>⠿</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.segTitle} numberOfLines={1}>
                  {seg.focus.name}
                  {seg.note ? ` · ${seg.note}` : ''}
                </Text>
                {!!seg.bpm && <Text style={s.segSub}>{store.t('plan.metronomeBpm', { bpm: seg.bpm })}</Text>}
              </View>
              <View style={s.minChip}>
                <Text style={s.minChipText}>{store.t('plan.minShort', { min: seg.min })}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable style={s.addRow} onPress={() => openEdit(-1)} disabled={focusOptions.length === 0}>
            <Text style={s.addPlus}>+</Text>
            <Text style={s.addText}>
              {focusOptions.length === 0 ? store.t('plan.addFocusFirst') : store.t('plan.addSegment')}
            </Text>
          </Pressable>
        </View>

        <Pressable
          hitSlop={8}
          style={{ marginTop: 28, alignSelf: 'center' }}
          onPress={() => {
            store.removePlan(plan.id);
            router.back();
          }}>
          <Text style={s.deleteLink}>{store.t('plan.deletePlan')}</Text>
        </Pressable>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
        <Pressable
          style={[s.startBtn, plan.segments.length === 0 && { opacity: 0.4 }]}
          disabled={plan.segments.length === 0}
          onPress={() => router.push({ pathname: '/plan/run', params: { id: plan.id } })}>
          <PlayIcon />
          <Text style={s.startText}>{store.t('plan.startPlan')}</Text>
        </Pressable>
      </View>

      <Modal visible={editIdx !== null} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={s.backdrop} onPress={closeEdit}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>{editIdx === -1 ? store.t('plan.newSegment') : store.t('plan.editSegment')}</Text>
              <ScrollView style={{ maxHeight: 150 }}>
                <View style={s.chipWrap}>
                  {focusOptions.map((f) => {
                    const sel = draft?.focus.name === f.name && draft.focus.kind === f.kind;
                    return (
                      <Pressable
                        key={`${f.kind}:${f.name}`}
                        style={[s.chip, sel && s.chipSel]}
                        onPress={() => setDraft((d) => (d ? { ...d, focus: f } : d))}>
                        <Text style={[s.chipText, sel && { color: C.accent }]}>{f.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <TextInput
                style={s.input}
                value={draft?.note ?? ''}
                onChangeText={(t) => setDraft((d) => (d ? { ...d, note: t || undefined } : d))}
                placeholder={store.t('plan.notePlaceholder')}
                placeholderTextColor={C.tertiary}
              />
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>{store.t('plan.minutes')}</Text>
                <Stepper
                  value={draft?.min ?? 10}
                  min={1}
                  max={180}
                  onChange={(min) => setDraft((d) => (d ? { ...d, min } : d))}
                />
              </View>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>{store.t('plan.metronome')}</Text>
                <TextInput
                  style={s.bpmInput}
                  value={draft?.bpm ? String(draft.bpm) : ''}
                  onChangeText={(t) => {
                    const v = Number(t.replace(/\D/g, '').slice(0, 3));
                    setDraft((d) => (d ? { ...d, bpm: v > 0 && v <= MAX_SEG_BPM ? v : undefined } : d));
                  }}
                  keyboardType="number-pad"
                  placeholder="BPM"
                  placeholderTextColor={C.tertiary}
                />
              </View>
              {editIdx !== null && editIdx >= 0 && (
                <View style={s.rowBtns}>
                  <Pressable style={s.smallBtn} disabled={editIdx === 0} onPress={() => move(-1)}>
                    <Text style={[s.smallBtnText, editIdx === 0 && { color: C.faint }]}>{store.t('plan.moveUp')}</Text>
                  </Pressable>
                  <Pressable style={s.smallBtn} disabled={editIdx === plan.segments.length - 1} onPress={() => move(1)}>
                    <Text style={[s.smallBtnText, editIdx === plan.segments.length - 1 && { color: C.faint }]}>
                      {store.t('plan.moveDown')}
                    </Text>
                  </Pressable>
                  <Pressable style={s.smallBtn} onPress={removeSegment}>
                    <Text style={[s.smallBtnText, { color: C.accent }]}>{store.t('plan.delete')}</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={s.saveBtn} onPress={saveEdit}>
                <Text style={s.saveText}>{editIdx === -1 ? store.t('plan.addSegment') : store.t('plan.saveSegment')}</Text>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const s = useS();
  const bump = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <View style={s.stepper}>
      <Pressable style={s.stepBtn} hitSlop={6} onPress={() => bump(-5)}>
        <Text style={s.stepText}>−5</Text>
      </Pressable>
      <Pressable style={s.stepBtn} hitSlop={6} onPress={() => bump(-1)}>
        <Text style={s.stepText}>−1</Text>
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable style={s.stepBtn} hitSlop={6} onPress={() => bump(1)}>
        <Text style={s.stepText}>+1</Text>
      </Pressable>
      <Pressable style={s.stepBtn} hitSlop={6} onPress={() => bump(5)}>
        <Text style={s.stepText}>+5</Text>
      </Pressable>
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 24 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  navBtn: { width: 36, height: 36, borderRadius: r(18), backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  navGlyph: { fontSize: fs(18), color: C.ink, lineHeight: fs(20) },
  saveLink: { fontFamily: F.bodySemi, fontSize: fs(13.5), color: C.accent },
  title: { fontFamily: F.head, fontSize: fs(26), color: C.ink, padding: 0 },
  meta: { fontFamily: F.body, fontSize: fs(13.5), color: C.sub, marginTop: 4 },
  segCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: r(16), padding: 16 },
  handle: { fontSize: fs(15), color: C.chartInactive },
  segTitle: { fontFamily: F.bodyMed, fontSize: fs(15.5), color: C.ink },
  segSub: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  minChip: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: r(9), backgroundColor: C.bg, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  minChipText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.ink },
  addRow: { height: 50, borderRadius: r(14), borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.chartInactive, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addPlus: { fontFamily: F.bodySemi, fontSize: fs(17), color: C.accent },
  addText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  deleteLink: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.sub, textDecorationLine: 'underline' },
  startBtn: { height: 56, borderRadius: r(14), backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startText: { fontFamily: F.bodySemi, fontSize: fs(17), color: '#FFFFFF' },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, gap: 14 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  input: { height: 48, borderRadius: r(12), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.body, fontSize: fs(14.5), color: C.ink },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontFamily: F.bodyMed, fontSize: fs(14.5), color: C.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 38, height: 38, borderRadius: r(19), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.ink },
  stepValue: { fontFamily: F.head, fontSize: fs(18), color: C.ink, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  bpmInput: { width: 90, height: 44, borderRadius: r(12), backgroundColor: C.card, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 12, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink, textAlign: 'center' },
  rowBtns: { flexDirection: 'row', gap: 10 },
  smallBtn: { flex: 1, height: 42, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: F.bodySemi, fontSize: fs(16), color: '#FFFFFF' },
}));
