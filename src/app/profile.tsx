import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon } from '@/components/icons';
import { Card, Overline, ScreenTitle } from '@/components/ui';
import { useStore, WeekStart } from '@/lib/store';
import { C, F } from '@/lib/theme';

const INSTRUMENTS = ['Piano', 'Guitar', 'Violin', 'Cello', 'Flute', 'Voice', 'Drums', 'Bass'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOALS = [15, 30, 45, 60, 90];
// ponytail: reminder is a stored preference only — actual notification scheduling
// needs expo-notifications + a dev build (Expo Go can't show them)
const REMINDERS = ['Off', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];

type EditKey = 'name' | 'instruments' | 'goal' | 'quickLog' | 'quickLogFocus' | 'breakDays' | 'reminder' | 'weekStart' | 'stages';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.chip, selected && s.chipSel]} onPress={onPress}>
      <Text style={[s.chipText, selected && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export default function Profile() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<EditKey | null>(null);
  // draft values while the editor is open
  const [text, setText] = useState('');
  const [list, setList] = useState<string[]>([]);

  const initials = store.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const open = (key: EditKey) => {
    if (key === 'name') setText(store.name);
    if (key === 'goal') setText(String(store.dailyGoal));
    if (key === 'instruments') setList(store.instruments);
    if (key === 'breakDays') setList(store.breakDays);
    if (key === 'quickLog') setList(store.quickLog.map(String));
    if (key === 'stages') setList(store.stages);
    setEditing(key);
  };

  const toggle = (v: string) => setList((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));

  const save = () => {
    if (editing === 'name' && text.trim()) store.updateSettings({ name: text.trim() });
    if (editing === 'goal') {
      const n = Number(text);
      if (n > 0) store.updateSettings({ dailyGoal: Math.min(999, n) });
    }
    if (editing === 'instruments' && list.length) store.updateSettings({ instruments: list });
    if (editing === 'breakDays') store.updateSettings({ breakDays: list });
    if (editing === 'quickLog') {
      const nums = list.map(Number).filter((n) => n > 0 && n < 1000);
      if (nums.length) store.updateSettings({ quickLog: nums });
    }
    if (editing === 'stages') {
      const names = list.map((t) => t.trim()).filter(Boolean);
      if (names.length >= 2) store.updateSettings({ stages: names });
    }
    setEditing(null);
    store.showToast('Saved');
  };

  const pick = (patch: Parameters<typeof store.updateSettings>[0]) => {
    store.updateSettings(patch);
    setEditing(null);
    store.showToast('Saved');
  };

  const rows: { key: EditKey; label: string; value: string }[] = [
    { key: 'instruments', label: 'Instruments', value: store.instruments.join(', ') },
    { key: 'goal', label: 'Daily goal', value: `${store.dailyGoal} min` },
    { key: 'quickLog', label: 'Quick log presets', value: store.quickLog.map((n) => `${n}`).join(', ') + ' min' },
    { key: 'quickLogFocus', label: 'Quick log counts toward', value: store.quickLogFocus?.name ?? 'Nothing specific' },
    { key: 'breakDays', label: 'Break days', value: store.breakDays.length ? store.breakDays.join(', ') : 'None' },
    { key: 'reminder', label: 'Practice reminders', value: store.reminder },
    { key: 'weekStart', label: 'Week starts on', value: store.weekStart },
    { key: 'stages', label: 'Repertoire stages', value: store.stages.join(' · ') },
  ];

  const titles: Record<EditKey, string> = {
    name: 'Your name',
    instruments: 'Instruments',
    goal: 'Daily goal',
    quickLog: 'Quick log presets',
    quickLogFocus: 'Quick log counts toward',
    breakDays: 'Break days',
    reminder: 'Practice reminders',
    weekStart: 'Week starts on',
    stages: 'Repertoire stages',
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>Settings</ScreenTitle>

      <View style={s.head}>
        <Pressable style={s.avatar} onPress={() => open('name')}>
          <Text style={s.avatarText}>{initials}</Text>
        </Pressable>
        <Pressable onPress={() => open('name')}>
          <Text style={s.name}>{store.name}</Text>
        </Pressable>
        <Text style={s.sub}>{store.instruments.join(' & ')} · practicing since 2023</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Total practice</Overline>
          <Text style={s.statNum}>
            {Math.round(store.totalMin / 60)}
            <Text style={s.statUnit}> hrs</Text>
          </Text>
        </Card>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Best streak</Overline>
          <Text style={s.statNum}>
            {store.bestStreak}
            <Text style={s.statUnit}> days</Text>
          </Text>
        </Card>
      </View>

      <Card style={{ paddingVertical: 4, paddingHorizontal: 20 }}>
        {rows.map((row, i) => (
          <Pressable
            key={row.key}
            style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]}
            onPress={() => open(row.key)}>
            <Text style={s.rowLabel}>{row.label}</Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {row.value}
            </Text>
            <ChevronIcon />
          </Pressable>
        ))}
      </Card>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {editing && <Text style={s.sheetTitle}>{titles[editing]}</Text>}

            {(editing === 'name' || editing === 'goal') && (
              <TextInput
                style={s.input}
                value={text}
                onChangeText={(t) => setText(editing === 'goal' ? t.replace(/\D/g, '').slice(0, 3) : t)}
                keyboardType={editing === 'goal' ? 'number-pad' : 'default'}
                placeholder={editing === 'goal' ? 'Minutes per day' : 'Name'}
                placeholderTextColor={C.tertiary}
                autoFocus
                onSubmitEditing={save}
              />
            )}
            {editing === 'goal' && (
              <View style={s.chipWrap}>
                {GOALS.map((g) => (
                  <Chip key={g} label={`${g} min`} selected={Number(text) === g} onPress={() => setText(String(g))} />
                ))}
              </View>
            )}
            {editing === 'quickLog' && (
              <>
                <View style={s.chipWrap}>
                  {list.map((v, i) => (
                    <TextInput
                      key={i}
                      style={[s.input, { width: 90, textAlign: 'center' }]}
                      value={v}
                      onChangeText={(t) =>
                        setList((l) => l.map((x, j) => (j === i ? t.replace(/\D/g, '').slice(0, 3) : x)))
                      }
                      keyboardType="number-pad"
                      placeholder="min"
                      placeholderTextColor={C.tertiary}
                    />
                  ))}
                  {list.length < 5 && (
                    <Pressable style={s.addPresetBtn} onPress={() => setList((l) => [...l, ''])}>
                      <Text style={s.addPresetText}>+</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={s.editorHint}>Clear a field to remove that preset.</Text>
              </>
            )}
            {editing === 'instruments' && (
              <View style={s.chipWrap}>
                {INSTRUMENTS.map((inst) => (
                  <Chip key={inst} label={inst} selected={list.includes(inst)} onPress={() => toggle(inst)} />
                ))}
              </View>
            )}
            {editing === 'breakDays' && (
              <View style={s.chipWrap}>
                {DAYS.map((d) => (
                  <Chip key={d} label={d.slice(0, 3)} selected={list.includes(d)} onPress={() => toggle(d)} />
                ))}
              </View>
            )}
            {editing === 'quickLogFocus' && (
              <View style={s.chipWrap}>
                <Chip label="Nothing specific" selected={!store.quickLogFocus} onPress={() => pick({ quickLogFocus: null })} />
                {store.pieces
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      selected={store.quickLogFocus?.name === p.name}
                      onPress={() => pick({ quickLogFocus: { name: p.name, kind: 'Piece' } })}
                    />
                  ))}
                {store.techniques.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={store.quickLogFocus?.name === t}
                    onPress={() => pick({ quickLogFocus: { name: t, kind: 'Technique' } })}
                  />
                ))}
              </View>
            )}
            {editing === 'stages' && (
              <>
                {list.map((v, i) => (
                  <TextInput
                    key={i}
                    style={s.input}
                    value={v}
                    onChangeText={(t) => setList((l) => l.map((x, j) => (j === i ? t.slice(0, 20) : x)))}
                    placeholder={`Stage ${i + 1}`}
                    placeholderTextColor={C.tertiary}
                  />
                ))}
                {list.length < 6 && (
                  <Pressable style={s.addStageBtn} onPress={() => setList((l) => [...l, ''])}>
                    <Text style={s.addStageText}>+ Add stage</Text>
                  </Pressable>
                )}
                <Text style={s.editorHint}>In order, first to last. Clear a field to remove it; at least two stages.</Text>
              </>
            )}
            {editing === 'reminder' && (
              <View style={s.chipWrap}>
                {REMINDERS.map((r) => (
                  <Chip key={r} label={r} selected={store.reminder === r} onPress={() => pick({ reminder: r })} />
                ))}
              </View>
            )}
            {editing === 'weekStart' && (
              <View style={s.chipWrap}>
                {(['Monday', 'Sunday'] as WeekStart[]).map((w) => (
                  <Chip key={w} label={w} selected={store.weekStart === w} onPress={() => pick({ weekStart: w })} />
                ))}
              </View>
            )}

            {editing !== 'reminder' && editing !== 'weekStart' && editing !== 'quickLogFocus' && (
              <Pressable style={s.saveBtn} onPress={save}>
                <Text style={s.saveBtnText}>Save</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  head: { alignItems: 'center', gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontFamily: F.head, fontSize: 22, color: C.bg },
  name: { fontFamily: F.head, fontSize: 24, color: C.ink },
  sub: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.sub },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: 28, color: C.ink },
  statUnit: { fontFamily: F.bodyMed, fontSize: 14, color: C.sub },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: 10 },
  rowLabel: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: F.body, fontSize: 14, color: C.sub },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 16 },
  sheetTitle: { fontFamily: F.head, fontSize: 20, color: C.ink },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addPresetBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  addPresetText: { color: C.bg, fontSize: 24, lineHeight: 26, fontFamily: F.bodyMed },
  editorHint: { fontFamily: F.body, fontSize: 12.5, color: C.tertiary, marginTop: -6 },
  addStageBtn: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  addStageText: { fontFamily: F.bodyMed, fontSize: 14, color: C.sub },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: 13.5, color: C.ink },
  saveBtn: { height: 52, borderRadius: 14, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: 16, color: C.bg },
});
