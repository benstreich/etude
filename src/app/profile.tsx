import { useRouter } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon, LockIcon } from '@/components/icons';
import { Card, Overline, ScreenTitle } from '@/components/ui';
import { exportBackup, exportCsv, latestAutoBackup, pickBackup, restoreFiles } from '@/lib/backup';
import { autoBackupDate, parseBackup } from '@/lib/backup-math';
import { parseReminderTime, reminderLabel } from '@/lib/reminders';
import { dayLabel, useStore, WeekStart } from '@/lib/store';
import type { StreakMode } from '@/lib/streak-math';
import { F, themed, useC, type T } from '@/lib/theme';

// Values are persisted in settings — never translated. Labels are looked up per value at display time.
const INSTRUMENTS = ['Piano', 'Guitar', 'Violin', 'Cello', 'Flute', 'Voice', 'Drums', 'Bass'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOALS = [15, 30, 45, 60, 90];
const REMINDERS = ['Off', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const STREAK_KEYS: Record<StreakMode, string> = { off: 'settings.streakOff', strict: 'settings.streakStrict', relaxed: 'settings.streakRelaxed' };

const AUTO_BACKUP_KEYS: Record<number, string> = { 0: 'settings.off', 7: 'settings.weekly', 30: 'settings.monthly' };

const INSTRUMENT_KEYS: Record<string, string> = {
  Piano: 'settings.instPiano',
  Guitar: 'settings.instGuitar',
  Violin: 'settings.instViolin',
  Cello: 'settings.instCello',
  Flute: 'settings.instFlute',
  Voice: 'settings.instVoice',
  Drums: 'settings.instDrums',
  Bass: 'settings.instBass',
};

const DAY_KEYS: Record<string, string> = {
  Monday: 'settings.dayMonday',
  Tuesday: 'settings.dayTuesday',
  Wednesday: 'settings.dayWednesday',
  Thursday: 'settings.dayThursday',
  Friday: 'settings.dayFriday',
  Saturday: 'settings.daySaturday',
  Sunday: 'settings.daySunday',
};

type EditKey = 'name' | 'instruments' | 'goal' | 'quickLog' | 'quickLogFocus' | 'breakDays' | 'streaks' | 'reminder' | 'weekStart' | 'stages' | 'autoBackup';

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
  // ponytail: native in-app review sheet; row hides where no store flow exists (web, sideloads)
  const [canRate, setCanRate] = useState(false);
  useEffect(() => {
    StoreReview.hasAction().then(setCanRate).catch(() => {});
  }, []);
  // draft values while the editor is open
  const [text, setText] = useState('');
  const [list, setList] = useState<string[]>([]);

  // persisted value → localized label (stored values stay English)
  const instLabel = (v: string) => (INSTRUMENT_KEYS[v] ? store.t(INSTRUMENT_KEYS[v]) : v);
  const dayName = (v: string) => (DAY_KEYS[v] ? store.t(DAY_KEYS[v]) : v);

  const initials = store.name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '♪';

  const open = (key: EditKey) => {
    if (key === 'name') setText(store.name);
    if (key === 'goal') setText(String(store.dailyGoal));
    if (key === 'instruments') setList(store.instruments);
    if (key === 'breakDays') setList(store.breakDays);
    if (key === 'quickLog') setList(store.quickLog.map(String));
    if (key === 'stages') setList(store.stages);
    // a custom reminder time pre-fills the input; presets leave it empty
    if (key === 'reminder') setText(REMINDERS.includes(store.reminder) ? '' : store.reminder);
    setEditing(key);
  };

  const toggle = (v: string) => setList((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));

  // invalid input keeps the sheet open with an honest toast — never a false "Saved"
  const save = () => {
    let error: string | null = null;
    if (editing === 'name') {
      const t = text.trim();
      if (t) store.updateSettings({ name: t });
      else error = store.t('settings.errName');
    }
    if (editing === 'goal') {
      const n = Number(text);
      if (n > 0) store.updateSettings({ dailyGoal: Math.min(999, n) });
      else error = store.t('settings.errGoal');
    }
    if (editing === 'instruments') {
      if (list.length) store.updateSettings({ instruments: list });
      else error = store.t('settings.errInstruments');
    }
    if (editing === 'breakDays') {
      // all 7 as break days would make the streak unbreakable and meaningless
      if (list.length < 7) store.updateSettings({ breakDays: list });
      else error = store.t('settings.errBreakDays');
    }
    if (editing === 'quickLog') {
      const nums = list.map(Number).filter((n) => n > 0 && n < 1000);
      if (nums.length) store.updateSettings({ quickLog: nums });
      else error = store.t('settings.errPresets');
    }
    if (editing === 'stages') {
      const names = list.map((t) => t.trim()).filter(Boolean);
      if (names.length >= 2) store.updateSettings({ stages: names });
      else error = store.t('settings.errStages');
    }
    if (error) return store.showToast(error);
    setEditing(null);
    store.showToast(store.t('toast.saved'));
  };

  const saveCustomReminder = () => {
    const t = parseReminderTime(text);
    if (!t) return store.showToast(store.t('settings.errTime'));
    pick({ reminder: reminderLabel(t) });
  };

  const pick = (patch: Parameters<typeof store.updateSettings>[0]) => {
    store.updateSettings(patch);
    setEditing(null);
    store.showToast(store.t('toast.saved'));
  };

  const backup = () =>
    exportBackup(store.backupState(), store.recordings).catch(() => store.showToast(store.t('settings.backupFailed')));
  const csv = () => exportCsv(store.sessions).catch(() => store.showToast(store.t('settings.exportFailed')));
  const confirmRestore = ({ state, files }: { state: object; files: Record<string, string> }) =>
    Alert.alert(store.t('settings.restoreConfirmTitle'), store.t('settings.restoreConfirmBody'), [
      { text: store.t('settings.cancel'), style: 'cancel' },
      {
        text: store.t('settings.restore'),
        style: 'destructive',
        onPress: () => {
          restoreFiles(files);
          store.restoreBackup(state);
          store.showToast(store.t('settings.backupRestored'));
        },
      },
    ]);
  const pickAndRestore = async () => {
    let picked: Awaited<ReturnType<typeof pickBackup>>;
    try {
      picked = await pickBackup();
    } catch {
      return store.showToast(store.t('settings.notABackup'));
    }
    if (picked) confirmRestore(picked);
  };
  const restore = () => {
    const auto = latestAutoBackup();
    if (!auto) return pickAndRestore();
    const label = dayLabel(autoBackupDate(auto.name)!, store.today, store.t, store.lang);
    const when = label === store.t('common.today') || label === store.t('common.yesterday') ? label.toLowerCase() : label;
    Alert.alert(store.t('settings.restoreFromBackup'), store.t('settings.autoBackupFound', { when }), [
      { text: store.t('settings.cancel'), style: 'cancel' },
      { text: store.t('settings.chooseFile'), onPress: pickAndRestore },
      {
        text: store.t('settings.useAutoBackup'),
        onPress: async () => {
          try {
            confirmRestore(parseBackup(await auto.text()));
          } catch {
            store.showToast(store.t('settings.backupUnreadable'));
          }
        },
      },
    ]);
  };

  const rows: { key: EditKey; label: string; value: string }[] = [
    { key: 'instruments', label: store.t('settings.instruments'), value: store.instruments.map(instLabel).join(', ') },
    { key: 'goal', label: store.t('settings.dailyGoal'), value: `${store.dailyGoal} ${store.t('settings.min')}` },
    { key: 'quickLog', label: store.t('settings.quickLog'), value: store.quickLog.map((n) => `${n}`).join(', ') + ` ${store.t('settings.min')}` },
    { key: 'quickLogFocus', label: store.t('settings.quickLogFocus'), value: store.quickLogFocus?.name ?? store.t('settings.nothingSpecific') },
    { key: 'breakDays', label: store.t('settings.breakDays'), value: store.breakDays.length ? store.breakDays.map(dayName).join(', ') : store.t('settings.none') },
    { key: 'streaks', label: store.t('settings.streaks'), value: store.t(STREAK_KEYS[store.streakMode]) },
    { key: 'reminder', label: store.t('settings.reminders'), value: store.reminder === 'Off' ? store.t('settings.off') : store.reminder },
    { key: 'weekStart', label: store.t('settings.weekStart'), value: dayName(store.weekStart) },
    { key: 'stages', label: store.t('settings.stages'), value: store.stages.join(' · ') },
  ];

  const titles: Record<EditKey, string> = {
    name: store.t('settings.yourName'),
    instruments: store.t('settings.instruments'),
    goal: store.t('settings.dailyGoal'),
    quickLog: store.t('settings.quickLog'),
    quickLogFocus: store.t('settings.quickLogFocus'),
    breakDays: store.t('settings.breakDays'),
    streaks: store.t('settings.streaks'),
    reminder: store.t('settings.reminders'),
    weekStart: store.t('settings.weekStart'),
    stages: store.t('settings.stages'),
    autoBackup: store.t('settings.autoBackups'),
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <ScreenTitle>{store.t('tabs.settings')}</ScreenTitle>

      <View style={s.head}>
        <Pressable style={s.avatar} onPress={() => open('name')}>
          <Text style={s.avatarText}>{initials}</Text>
        </Pressable>
        <Pressable onPress={() => open('name')}>
          <Text style={s.name}>{store.name || store.t('settings.addYourName')}</Text>
        </Pressable>
        <Text style={s.sub}>{store.instruments.length ? store.instruments.map(instLabel).join(' & ') : store.t('settings.setInstruments')}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={s.stat}>
          <Overline style={{ marginBottom: 10 }}>{store.t('settings.totalPractice')}</Overline>
          <Text style={s.statNum}>
            {Math.round(store.totalMin / 60)}
            <Text style={s.statUnit}> {store.t('settings.hrsUnit')}</Text>
          </Text>
        </Card>
        {store.streakMode !== 'off' && (
          <Card style={s.stat}>
            <Overline style={{ marginBottom: 10 }}>{store.t('settings.bestStreak')}</Overline>
            <Text style={s.statNum}>
              {store.bestStreak}
              <Text style={s.statUnit}> {store.t('settings.daysUnit')}</Text>
            </Text>
          </Card>
        )}
      </View>

      <Card style={{ paddingVertical: 4, paddingHorizontal: 20 }}>
        <Pressable style={s.row} onPress={() => router.push('/appearance')}>
          <Text style={s.rowLabel}>{store.t('appearance.title')}</Text>
          <Text style={s.rowValue} numberOfLines={1}>
            {store.t(store.theme === 'system' ? 'appearance.system' : store.theme === 'dark' ? 'appearance.dark' : 'appearance.light')}
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

      <View style={{ gap: 12 }}>
        <Overline>{store.t('settings.yourData')}</Overline>
        <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
          {(
            [
              [store.t('settings.backupEverything'), store.t('settings.backupEverythingSub'), backup],
              [
                store.t('settings.autoBackups'),
                AUTO_BACKUP_KEYS[store.autoBackupDays]
                  ? store.t(AUTO_BACKUP_KEYS[store.autoBackupDays])
                  : store.t('settings.everyNDays', { n: store.autoBackupDays }),
                () => setEditing('autoBackup'),
              ],
              [store.t('settings.exportCsv'), store.t('settings.exportCsvSub'), csv],
              [store.t('settings.restoreFromBackup'), store.t('settings.restoreSub'), restore],
            ] as const
          ).map(([label, sub, onPress], i) => (
            <Pressable key={label} style={[s.dataRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.hairline }]} onPress={onPress}>
              <View style={{ flex: 1 }}>
                <Text style={s.dataLabel}>{label}</Text>
                <Text style={s.dataSub}>{sub}</Text>
              </View>
              <ChevronIcon />
            </Pressable>
          ))}
        </Card>
        <View style={s.dataFootRow}>
          <LockIcon size={13} />
          <Text style={s.dataFoot}>{store.t('settings.privacyFooter')}</Text>
        </View>
      </View>

      {canRate && (
        <Card style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
          <Pressable style={s.dataRow} onPress={() => StoreReview.requestReview().catch(() => {})}>
            <View style={{ flex: 1 }}>
              <Text style={s.dataLabel}>{store.t('settings.rate')}</Text>
              <Text style={s.dataSub}>{store.t('settings.rateSub')}</Text>
            </View>
            <ChevronIcon />
          </Pressable>
        </Card>
      )}

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
                placeholder={editing === 'goal' ? store.t('settings.minutesPerDay') : store.t('settings.namePlaceholder')}
                placeholderTextColor={C.tertiary}
                autoFocus
                onSubmitEditing={save}
              />
            )}
            {editing === 'goal' && (
              <View style={s.chipWrap}>
                {GOALS.map((g) => (
                  <Chip key={g} label={`${g} ${store.t('settings.min')}`} selected={Number(text) === g} onPress={() => setText(String(g))} />
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
                      placeholder={store.t('settings.min')}
                      placeholderTextColor={C.tertiary}
                    />
                  ))}
                  {list.length < 5 && (
                    <Pressable style={s.addPresetBtn} onPress={() => setList((l) => [...l, ''])}>
                      <Text style={s.addPresetText}>+</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={s.editorHint}>{store.t('settings.clearPresetHint')}</Text>
              </>
            )}
            {editing === 'instruments' && (
              <View style={s.chipWrap}>
                {INSTRUMENTS.map((inst) => (
                  <Chip key={inst} label={instLabel(inst)} selected={list.includes(inst)} onPress={() => toggle(inst)} />
                ))}
              </View>
            )}
            {editing === 'breakDays' && (
              <View style={s.chipWrap}>
                {DAYS.map((d) => (
                  <Chip key={d} label={dayName(d).slice(0, 2)} selected={list.includes(d)} onPress={() => toggle(d)} />
                ))}
              </View>
            )}
            {editing === 'quickLogFocus' && (
              <View style={s.chipWrap}>
                <Chip label={store.t('settings.nothingSpecific')} selected={!store.quickLogFocus} onPress={() => pick({ quickLogFocus: null })} />
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
                    placeholder={store.t('settings.stagePlaceholder', { n: i + 1 })}
                    placeholderTextColor={C.tertiary}
                  />
                ))}
                {list.length < 6 && (
                  <Pressable style={s.addStageBtn} onPress={() => setList((l) => [...l, ''])}>
                    <Text style={s.addStageText}>{store.t('settings.addStage')}</Text>
                  </Pressable>
                )}
                <Text style={s.editorHint}>{store.t('settings.stagesHint')}</Text>
              </>
            )}
            {editing === 'streaks' && (
              <>
                <View style={s.chipWrap}>
                  {(['off', 'strict', 'relaxed'] as StreakMode[]).map((m) => (
                    <Chip key={m} label={store.t(STREAK_KEYS[m])} selected={store.streakMode === m} onPress={() => pick({ streakMode: m })} />
                  ))}
                </View>
                <Text style={s.editorHint}>{store.t('settings.streaksHint')}</Text>
              </>
            )}
            {editing === 'reminder' && (
              <>
                <View style={s.chipWrap}>
                  {REMINDERS.map((r) => (
                    <Chip key={r} label={r === 'Off' ? store.t('settings.off') : r} selected={store.reminder === r} onPress={() => pick({ reminder: r })} />
                  ))}
                  {!REMINDERS.includes(store.reminder) && (
                    <Chip label={store.reminder} selected onPress={() => {}} />
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={text}
                    onChangeText={setText}
                    placeholder={store.t('settings.customTimePlaceholder')}
                    placeholderTextColor={C.tertiary}
                    onSubmitEditing={saveCustomReminder}
                    returnKeyType="done"
                  />
                  <Pressable style={s.addPresetBtn} onPress={saveCustomReminder}>
                    <Text style={s.addPresetText}>✓</Text>
                  </Pressable>
                </View>
              </>
            )}
            {editing === 'autoBackup' && (
              <>
                <View style={s.chipWrap}>
                  {([0, 7, 30] as const).map((d) => (
                    <Chip key={d} label={store.t(AUTO_BACKUP_KEYS[d])} selected={store.autoBackupDays === d} onPress={() => pick({ autoBackupDays: d })} />
                  ))}
                </View>
                <Text style={s.editorHint}>{store.t('settings.autoBackupHint')}</Text>
              </>
            )}
            {editing === 'weekStart' && (
              <View style={s.chipWrap}>
                {(['Monday', 'Sunday'] as WeekStart[]).map((w) => (
                  <Chip key={w} label={dayName(w)} selected={store.weekStart === w} onPress={() => pick({ weekStart: w })} />
                ))}
              </View>
            )}

            {editing !== 'reminder' && editing !== 'weekStart' && editing !== 'quickLogFocus' && editing !== 'streaks' && editing !== 'autoBackup' && (
              <Pressable style={s.saveBtn} onPress={save}>
                <Text style={s.saveBtnText}>{store.t('settings.save')}</Text>
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
  editorHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.subStrong, marginTop: -6 },
  addStageBtn: { height: 44, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  addStageText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), borderWidth: 1, borderColor: C.inputBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56 },
  dataLabel: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  dataSub: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  dataFootRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 4, alignItems: 'flex-start' },
  dataFoot: { flex: 1, fontFamily: F.body, fontSize: fs(12.5), lineHeight: fs(19), color: C.sub },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
