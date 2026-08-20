import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon } from '@/components/icons';
import { Card, Overline, ScreenTitle } from '@/components/ui';
import { useStore, WeekStart } from '@/lib/store';
import type { StreakMode } from '@/lib/streak-math';
import { F, themed, useC, type T } from '@/lib/theme';

const INSTRUMENTS = ['Piano', 'Guitar', 'Violin', 'Cello', 'Flute', 'Voice', 'Drums', 'Bass'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOALS = [15, 30, 45, 60, 90];
const REMINDERS = ['Off', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const STREAK_LABELS: Record<StreakMode, string> = { off: 'Off', strict: 'Strict', relaxed: 'Relaxed' };

type EditKey = 'name' | 'instruments' | 'goal' | 'quickLog' | 'quickLogFocus' | 'breakDays' | 'streaks' | 'reminder' | 'weekStart' | 'stages';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const s = useS();
  const C = useC();
  return (
    <Pressable style={[s.chip, selected && s.chipSel]} onPress={onPress}>
      <Text style={[s.chipText, selected && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export default function Profile() {
  const router = useRouter();
  const s = useS();
  const C = useC();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<EditKey | null>(null);
  // draft values while the editor is open
  const [text, setText] = useState('');
  const [list, setList] = useState<string[]>([]);

  const initials = store.name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '♪';

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

  // invalid input keeps the sheet open with an honest toast — never a false "Saved"
  const save = () => {
    let error: string | null = null;
    if (editing === 'name') {
      const t = text.trim();
      if (t) store.updateSettings({ name: t });
      else error = 'Enter a name';
    }
    if (editing === 'goal') {
      const n = Number(text);
      if (n > 0) store.updateSettings({ dailyGoal: Math.min(999, n) });
      else error = 'Goal needs to be at least 1 minute';
    }
    if (editing === 'instruments') {
      if (list.length) store.updateSettings({ instruments: list });
      else error = 'Pick at least one instrument';
    }
    if (editing === 'breakDays') {
      // all 7 as break days would make the streak unbreakable and meaningless
      if (list.length < 7) store.updateSettings({ breakDays: list });
      else error = 'Keep at least one practice day';
    }
    if (editing === 'quickLog') {
      const nums = list.map(Number).filter((n) => n > 0 && n < 1000);
      if (nums.length) store.updateSettings({ quickLog: nums });
      else error = 'Keep at least one preset';
    }
    if (editing === 'stages') {
      const names = list.map((t) => t.trim()).filter(Boolean);
      if (names.length >= 2) store.updateSettings({ stages: names });
      else error = 'At least two stages';
    }
    if (error) return store.showToast(error);
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
    { key: 'quickLogFocus', label: 'Quick log focus', value: store.quickLogFocus?.name ?? 'Nothing specific' },
    { key: 'breakDays', label: 'Break days', value: store.breakDays.length ? store.breakDays.join(', ') : 'None' },
    { key: 'streaks', label: 'Streaks', value: STREAK_LABELS[store.streakMode] },
    { key: 'reminder', label: 'Practice reminders', value: store.reminder },
    { key: 'weekStart', label: 'Week starts on', value: store.weekStart },
    { key: 'stages', label: 'Repertoire stages', value: store.stages.join(' · ') },
  ];

  const titles: Record<EditKey, string> = {
    name: 'Your name',
    instruments: 'Instruments',
    goal: 'Daily goal',
    quickLog: 'Quick log presets',
    quickLogFocus: 'Quick log focus',
    breakDays: 'Break days',
    streaks: 'Streaks',
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
          <Text style={s.name}>{store.name || 'Add your name'}</Text>
        </Pressable>
        <Text style={s.sub}>{store.instruments.length ? store.instruments.join(' & ') : 'Set your instruments below'}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>Total practice</Overline>
          <Text style={s.statNum}>
            {Math.round(store.totalMin / 60)}
            <Text style={s.statUnit}> hrs</Text>
          </Text>
        </Card>
        {store.streakMode !== 'off' && (
          <Card style={s.stat}>
            <Overline style={{ marginBottom: 10 }}>Best streak</Overline>
            <Text style={s.statNum}>
              {store.bestStreak}
              <Text style={s.statUnit}> days</Text>
            </Text>
          </Card>
        )}
      </View>

      <Card style={{ paddingVertical: 4, paddingHorizontal: 20 }}>
        <Pressable style={s.row} onPress={() => router.push('/appearance')}>
          <Text style={s.rowLabel}>Appearance</Text>
          <Text style={s.rowValue} numberOfLines={1}>
            {store.theme === 'system' ? 'System' : store.theme === 'dark' ? 'Dark' : 'Light'}
          </Text>
          <ChevronIcon />
        </Pressable>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={[s.row, { borderTopWidth: 1, borderTopColor: C.hairline }]}
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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
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
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {list.map((v, i) => (
                    <TextInput
                      key={i}
                      style={[s.input, { flex: 1, textAlign: 'center' }]}
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
            {editing === 'streaks' && (
              <>
                <View style={s.chipWrap}>
                  {(['off', 'strict', 'relaxed'] as StreakMode[]).map((m) => (
                    <Chip key={m} label={STREAK_LABELS[m]} selected={store.streakMode === m} onPress={() => pick({ streakMode: m })} />
                  ))}
                </View>
                <Text style={s.editorHint}>
                  Strict ends the streak after one missed day; Relaxed forgives a single missed day. Break days never
                  count against it, and logging a past day revives it either way.
                </Text>
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

            {editing !== 'reminder' && editing !== 'weekStart' && editing !== 'quickLogFocus' && editing !== 'streaks' && (
              <Pressable style={s.saveBtn} onPress={save}>
                <Text style={s.saveBtnText}>Save</Text>
              </Pressable>
            )}
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 26 },
  head: { alignItems: 'center', gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: r(32), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontFamily: F.head, fontSize: fs(22), color: C.bg },
  name: { fontFamily: F.head, fontSize: fs(24), color: C.ink },
  sub: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.sub },
  stat: { flex: 1 },
  statNum: { fontFamily: F.head, fontSize: fs(28), color: C.ink },
  statUnit: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: 10 },
  rowLabel: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: F.body, fontSize: fs(14), color: C.sub },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 16 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  input: { height: 48, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 14, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addPresetBtn: { width: 48, height: 48, borderRadius: r(12), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  addPresetText: { color: C.bg, fontSize: fs(24), lineHeight: fs(26), fontFamily: F.bodyMed },
  editorHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, marginTop: -6 },
  addStageBtn: { height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  addStageText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
