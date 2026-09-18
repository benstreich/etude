import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as Updates from 'expo-updates';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { TimeWheel } from '@/components/time-wheel';
import { ProgressLayoutSheet } from '@/components/progress-layout-sheet';
import { BackLink, Overline, RuledStats, Sheet } from '@/components/ui';
import { filesOf } from '@/lib/attachment-math';
import { exportBackup, exportCsv, latestAutoBackup, pickBackup, restoreFiles } from '@/lib/backup';
import { autoBackupDate, parseBackup } from '@/lib/backup-math';
import { primaryOf } from '@/lib/cue-voice';
import { goalProgress, type GoalPeriod } from '@/lib/goal-math';
import { KEYS } from '@/lib/melody';
import { ALL_INSTRUMENTS, INSTRUMENTS } from '@/lib/instruments';
import { notificationsAllowed, parseReminderTime, reminderLabel } from '@/lib/reminders';
import { resolveLayout } from '@/lib/progress-sections';
import { type LanguageSetting } from '@/lib/i18n';
import { dayLabel, useStore, WeekStart } from '@/lib/store';
import type { StreakMode } from '@/lib/streak-math';
import { F, themed, useC, type T } from '@/lib/theme';

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

const REPO = 'https://github.com/benstreich/etude';
// hosted as a gist because the app has no website to put it on
const PRIVACY_URL = 'https://gist.github.com/benstreich/838abedca283b1381b521958ddd46007';
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.benstreich.etude';

// language names stay endonyms — a German speaker looking for their language
// should find "Deutsch" even while the app shows English
const LANGS: { value: LanguageSetting; label?: string; key?: string }[] = [
  { value: 'system', key: 'appearance.system' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];
const LANG_LABEL = (store: ReturnType<typeof useStore>): Record<LanguageSetting, string> => ({
  system: store.t('appearance.system'),
  en: 'English',
  de: 'Deutsch',
});

const DAY_KEYS: Record<string, string> = {
  Monday: 'settings.dayMonday',
  Tuesday: 'settings.dayTuesday',
  Wednesday: 'settings.dayWednesday',
  Thursday: 'settings.dayThursday',
  Friday: 'settings.dayFriday',
  Saturday: 'settings.daySaturday',
  Sunday: 'settings.daySunday',
};

type EditKey = 'language' | 'name' | 'periodGoals' | 'instruments' | 'primaryInstrument' | 'goal' | 'breakEvery' | 'quickLog' | 'quickLogFocus' | 'breakDays' | 'streaks' | 'reminder' | 'weekStart' | 'stages' | 'melodyKey' | 'autoBackup';

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
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layoutAll = resolveLayout(store.progressLayout);
  const layoutTotal = layoutAll.length;
  const layoutOn = layoutAll.filter((l) => l.on).length;
  // ponytail: native in-app review sheet; row hides where no store flow exists (web, sideloads)
  const [canRate, setCanRate] = useState(false);
  useEffect(() => {
    StoreReview.hasAction().then(setCanRate).catch(() => {});
  }, []);
  // draft values while the editor is open
  const [text, setText] = useState('');
  const [time, setTime] = useState({ hour: 19, minute: 0 });
  const [notifAllowed, setNotifAllowed] = useState(true);
  const [list, setList] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null); // null = full instrument list collapsed

  // persisted value → localized label (stored values stay English)
  const instLabel = (v: string) => (INSTRUMENT_KEYS[v] ? store.t(INSTRUMENT_KEYS[v]) : v);
  const dayName = (v: string) => (DAY_KEYS[v] ? store.t(DAY_KEYS[v]) : v);

  const open = (key: EditKey) => {
    if (key === 'name') setText(store.name);
    if (key === 'goal') setText(String(store.dailyGoal));
    if (key === 'instruments') {
      setList(store.instruments);
      setQuery(null);
    }
    if (key === 'periodGoals') setList([store.weeklyGoal, store.monthlyGoal, store.yearlyGoal].map((n) => (n > 0 ? String(n) : '')));
    if (key === 'breakDays') setList(store.breakDays);
    if (key === 'quickLog') setList(store.quickLog.map(String));
    if (key === 'stages') setList(store.stages);
    // the wheel opens on the current custom time, or 7:00 PM for a preset/Off
    if (key === 'reminder') {
      setTime(parseReminderTime(store.reminder) ?? { hour: 19, minute: 0 });
      notificationsAllowed().then(setNotifAllowed).catch(() => {});
    }
    setEditing(key);
  };

  const toggle = (v: string) => setList((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));

  // invalid input keeps the sheet open with an honest toast — never a false "Saved"
  const moveStage = (i: number, dir: -1 | 1) =>
    setList((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

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
    if (editing === 'periodGoals') {
      // blank or 0 means "derive from the daily goal" — goal-math does that, not a second flag
      const [w, m, y] = list.map((v) => Math.min(999999, Math.max(0, Math.round(Number(v) || 0))));
      store.updateSettings({ weeklyGoal: w, monthlyGoal: m, yearlyGoal: y });
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

  const saveCustomReminder = () => pick({ reminder: reminderLabel(time) });

  const pick = (patch: Parameters<typeof store.updateSettings>[0]) => {
    store.updateSettings(patch);
    setEditing(null);
    store.showToast(store.t('toast.saved'));
  };

  const backup = () =>
    // recordings and score pages travel with the state, or a restored phone
    // shows empty players and blank thumbnails
    exportBackup(store.backupState(), [...store.recordings.map((r) => r.uri), ...filesOf(store.attachments)]).catch(() =>
      store.showToast(store.t('settings.backupFailed'))
    );
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

  // each period shows its effective target — the explicit one, or what the daily goal derives to
  const goalOf = (period: GoalPeriod, goal: number) =>
    goalProgress({
      period,
      goal,
      todayKey: store.today,
      minutesByDate: store.minutesByDate,
      dailyGoal: store.dailyGoal,
      breakDays: store.breakDays,
      weekStart: store.weekStart,
    }).target;
  const periodGoalSummary = ([
    [store.weeklyGoal, 'week'],
    [store.monthlyGoal, 'month'],
    [store.yearlyGoal, 'year'],
  ] as const)
    .map(([goal, period]) => `${goalOf(period, goal)}${goal > 0 ? '' : store.t('settings.autoMark')}`)
    .join(' · ') + ` ${store.t('settings.min')}`;

  const rows: { key: EditKey | 'progressSections'; label: string; value: string }[] = [
    { key: 'instruments', label: store.t('settings.instruments'), value: store.instruments.map(instLabel).join(', ') },
    // only worth asking once there is something to choose between (#53)
    ...(store.instruments.length > 1
      ? [{ key: 'primaryInstrument' as const, label: store.t('settings.primaryInstrument'), value: instLabel(primaryOf(store.instruments, store.primaryInstrument)) }]
      : []),
    { key: 'goal', label: store.t('settings.dailyGoal'), value: `${store.dailyGoal} ${store.t('settings.min')}` },
    { key: 'periodGoals', label: store.t('settings.periodGoals'), value: periodGoalSummary },
    { key: 'quickLog', label: store.t('settings.quickLog'), value: store.quickLog.map((n) => `${n}`).join(', ') + ` ${store.t('settings.min')}` },
    { key: 'breakEvery', label: store.t('settings.breakEvery'), value: store.breakEvery ? store.t('settings.everyMin', { min: store.breakEvery }) : store.t('settings.off') },
    { key: 'quickLogFocus', label: store.t('settings.quickLogFocus'), value: store.quickLogFocus?.name ?? store.t('settings.nothingSpecific') },
    { key: 'breakDays', label: store.t('settings.breakDays'), value: store.breakDays.length ? store.breakDays.map(dayName).join(', ') : store.t('settings.none') },
    { key: 'streaks', label: store.t('settings.streaks'), value: store.t(STREAK_KEYS[store.streakMode]) },
    { key: 'reminder', label: store.t('settings.reminders'), value: store.reminder === 'Off' ? store.t('settings.off') : store.reminder },
    { key: 'weekStart', label: store.t('settings.weekStart'), value: dayName(store.weekStart) },
    { key: 'stages', label: store.t('settings.stages'), value: store.stages.join(' · ') },
    { key: 'melodyKey', label: store.t('settings.melodyKey'), value: store.t('settings.majorKey', { key: store.melodyKey }) },
    { key: 'progressSections', label: store.t('settings.progressSections'), value: store.t('settings.nOfM', { n: layoutOn, m: layoutTotal }) },
    // language is not a look-and-feel knob; it was buried in Appearance and nobody found it
    { key: 'language', label: store.t('appearance.language'), value: LANG_LABEL(store)[store.language] },
  ];

  const titles: Record<EditKey, string> = {
    language: store.t('appearance.language'),
    name: store.t('settings.yourName'),
    instruments: store.t('settings.instruments'),
    primaryInstrument: store.t('settings.primaryInstrument'),
    goal: store.t('settings.dailyGoal'),
    periodGoals: store.t('settings.periodGoals'),
    quickLog: store.t('settings.quickLog'),
    breakEvery: store.t('settings.breakEvery'),
    quickLogFocus: store.t('settings.quickLogFocus'),
    breakDays: store.t('settings.breakDays'),
    streaks: store.t('settings.streaks'),
    reminder: store.t('settings.reminders'),
    weekStart: store.t('settings.weekStart'),
    stages: store.t('settings.stages'),
    melodyKey: store.t('settings.melodyKey'),
    autoBackup: store.t('settings.autoBackups'),
  };

  const totalHours = Math.floor(store.totalMin / 60);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 24 }]}>
      <BackLink label={store.t('tabs.home')} onPress={() => router.back()} />

      <Pressable onPress={() => open('name')}>
        <Text style={s.name}>{store.name || store.t('settings.addYourName')}</Text>
      </Pressable>
      <Text style={s.sub}>{store.instruments.length ? store.instruments.map(instLabel).join(' & ') : store.t('settings.setInstruments')}</Text>

      <RuledStats
        items={[
          { label: store.t('settings.totalPractice'), value: <Text>{totalHours} <Text style={s.statUnit}>{store.t('settings.hoursUnit')}</Text></Text> },
          { label: store.t('settings.bestStreak'), value: <Text>{store.bestStreak} <Text style={s.statUnit}>{store.t('settings.daysUnit')}</Text></Text> },
        ]}
      />

      <View>
        <Overline>{store.t('settings.practice')}</Overline>
        <View style={{ marginTop: 6 }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              testID={`setting-${row.key}`}
              style={s.row}
              onPress={() => (row.key === 'progressSections' ? setLayoutOpen(true) : open(row.key))}>
              <Text style={s.rowLabel}>{row.label}</Text>
              <Text style={s.rowValue} numberOfLines={1}>
                {row.value}
              </Text>
              <ChevronIcon />
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Overline>{store.t('appearance.title')}</Overline>
        <View style={{ marginTop: 6 }}>
          <Pressable style={s.row} onPress={() => router.push('/appearance')}>
            <Text style={s.rowLabel}>{store.t('appearance.title')}</Text>
            <Text style={s.rowValue} numberOfLines={1}>
              {store.t(store.theme === 'system' ? 'appearance.system' : store.theme === 'dark' ? 'appearance.dark' : 'appearance.light')}
            </Text>
            <ChevronIcon />
          </Pressable>
        </View>
      </View>

      <View>
        <Overline>{store.t('settings.yourData')}</Overline>
        <View style={{ marginTop: 6 }}>
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
          ).map(([label, sub, onPress]) => (
            <Pressable key={label} style={s.dataRow} onPress={onPress}>
              <View style={{ flex: 1 }}>
                <Text style={s.dataLabel}>{label}</Text>
                <Text style={s.dataSub}>{sub}</Text>
              </View>
              <ChevronIcon />
            </Pressable>
          ))}
        </View>
        <Text style={s.dataFoot}>{store.t('settings.privacyFooter')}</Text>
      </View>

      {/* About (#64): the openness is part of the product, so it is in the app,
          not only in the README. */}
      <View>
        <Overline>{store.t('settings.about')}</Overline>
        <View style={{ marginTop: 6 }}>
          {(
            [
              [store.t('settings.howBuilt'), `${REPO}/blob/main/docs/how-etude-is-built.md`],
              [store.t('settings.sourceCode'), REPO],
              [store.t('settings.privacyPolicy'), PRIVACY_URL],
              // in-app review only exists for a Play install, and Play rations it even
              // then; the listing link is the fallback that always does something
              [store.t('settings.rate'), STORE_URL],
            ] as const
          ).map(([label, url], i, arr) => (
            <Pressable
              key={label}
              style={[s.row, i === arr.length - 1 && s.rowClose]}
              onPress={async () => {
                if (url === STORE_URL && canRate) {
                  try {
                    return await StoreReview.requestReview();
                  } catch {
                    // fall through to the listing
                  }
                }
                Linking.openURL(url).catch(() => store.showToast(store.t('settings.linkFailed')));
              }}>
              <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>
              <ChevronIcon />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Which bundle is actually running. The app version stays 1.0.0 across
          every OTA update, so the update id is the only part that moves. */}
      <Text style={s.version}>
        {`Etude ${Constants.expoConfig?.version ?? '?'} · ${
          Updates.isEmbeddedLaunch ? 'bundled' : (Updates.updateId?.slice(0, 8) ?? 'dev')
        }`}
      </Text>
      {/* CC BY 3.0 asks for the credit somewhere in the product; the piano samples in assets/audio/piano */}
      <Text style={s.version}>{store.t('settings.credits')}</Text>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} style={s.sheet} contentStyle={{ gap: 16 }}>
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
            {editing === 'periodGoals' && (
              <>
                {(['weekly', 'monthly', 'yearly'] as const).map((k, i) => (
                  <View key={k}>
                    <Text style={s.inputLabel}>{store.t(`settings.${k}Goal`)}</Text>
                    <TextInput
                      style={s.input}
                      value={list[i] ?? ''}
                      onChangeText={(t) => setList((l) => l.map((v, j) => (j === i ? t.replace(/\D/g, '').slice(0, 6) : v)))}
                      keyboardType="number-pad"
                      placeholder={store.t('settings.goalAuto', { n: goalOf((['week', 'month', 'year'] as const)[i], 0) })}
                      placeholderTextColor={C.tertiary}
                    />
                  </View>
                ))}
                <Text style={s.editorHint}>{store.t('settings.periodGoalsHint')}</Text>
              </>
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
                </View>
                <Text style={s.editorHint}>{store.t('settings.clearPresetHint')}</Text>
              </>
            )}
            {editing === 'instruments' && (
              <>
                <View style={s.chipWrap}>
                  {[...INSTRUMENTS, ...list.filter((v) => !INSTRUMENTS.includes(v))].map((inst) => (
                    <Chip key={inst} label={instLabel(inst)} selected={list.includes(inst)} onPress={() => toggle(inst)} />
                  ))}
                  <Chip label={store.t('settings.moreInstruments')} selected={query !== null} onPress={() => setQuery(query === null ? '' : null)} />
                </View>
                {query !== null && (
                  <>
                    <TextInput
                      style={s.input}
                      value={query}
                      onChangeText={setQuery}
                      placeholder={store.t('settings.searchInstruments')}
                      placeholderTextColor={C.tertiary}
                      autoCorrect={false}
                      autoFocus
                    />
                    {/* ponytail: filter + map over ~90 names — no virtualized list for a chip grid this size */}
                    <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      <View style={s.chipWrap}>
                        {ALL_INSTRUMENTS.filter((v) => instLabel(v).toLowerCase().includes(query.trim().toLowerCase())).map((inst) => (
                          <Chip key={inst} label={instLabel(inst)} selected={list.includes(inst)} onPress={() => toggle(inst)} />
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
              </>
            )}
            {editing === 'melodyKey' && (
              <>
                <View style={s.chipWrap}>
                  {KEYS.map((k) => (
                    <Chip key={k} label={store.t('settings.majorKey', { key: k })} selected={store.melodyKey === k} onPress={() => pick({ melodyKey: k })} />
                  ))}
                </View>
                <Text style={s.editorHint}>{store.t('settings.melodyKeyHint')}</Text>
              </>
            )}
            {editing === 'primaryInstrument' && (
              <>
                <View style={s.chipWrap}>
                  {store.instruments.map((inst) => (
                    <Chip
                      key={inst}
                      label={instLabel(inst)}
                      selected={primaryOf(store.instruments, store.primaryInstrument) === inst}
                      onPress={() => pick({ primaryInstrument: inst })}
                    />
                  ))}
                </View>
                <Text style={s.editorHint}>{store.t('settings.primaryInstrumentHint')}</Text>
              </>
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
                {/* the order is the progression, so it has to be rearrangeable
                    without retyping every field (#43). Pieces keep their stage
                    index, exactly as they do when a stage is renamed. */}
                {list.map((v, i) => (
                  <View key={i} style={s.stageRow}>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={v}
                      onChangeText={(t) => setList((l) => l.map((x, j) => (j === i ? t.slice(0, 20) : x)))}
                      placeholder={store.t('settings.stagePlaceholder', { n: i + 1 })}
                      placeholderTextColor={C.tertiary}
                    />
                    <Pressable
                      style={s.moveBtn}
                      hitSlop={6}
                      disabled={i === 0}
                      accessibilityLabel={store.t('settings.moveUp')}
                      onPress={() => moveStage(i, -1)}>
                      <Text style={[s.moveGlyph, i === 0 && { color: C.faint }]}>↑</Text>
                    </Pressable>
                    <Pressable
                      style={s.moveBtn}
                      hitSlop={6}
                      disabled={i === list.length - 1}
                      accessibilityLabel={store.t('settings.moveDown')}
                      onPress={() => moveStage(i, 1)}>
                      <Text style={[s.moveGlyph, i === list.length - 1 && { color: C.faint }]}>↓</Text>
                    </Pressable>
                  </View>
                ))}
                {list.length < 6 && (
                  <Pressable style={s.addStageBtn} onPress={() => setList((l) => [...l, ''])}>
                    <Text style={s.addStageText}>{store.t('settings.addStage')}</Text>
                  </Pressable>
                )}
                <Text style={s.editorHint}>{store.t('settings.stagesHint')}</Text>
              </>
            )}
            {editing === 'breakEvery' && (
              <>
                <View style={s.chipWrap}>
                  {[0, 20, 25, 30, 45].map((m) => (
                    <Chip key={m} label={m ? store.t('settings.everyMin', { min: m }) : store.t('settings.off')} selected={store.breakEvery === m} onPress={() => pick({ breakEvery: m })} />
                  ))}
                </View>
                <Text style={s.editorHint}>{store.t('settings.breakEveryHint')}</Text>
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
                <TimeWheel value={time} onChange={setTime} />
                <Pressable style={s.wheelSave} onPress={saveCustomReminder}>
                  <Text style={s.wheelSaveText}>{reminderLabel(time)}</Text>
                </Pressable>
                {!notifAllowed && (
                  <Pressable onPress={() => Linking.openSettings()}>
                    <Text style={[s.editorHint, { color: C.accent }]}>{store.t('settings.notifBlocked')}</Text>
                  </Pressable>
                )}
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
            {editing === 'language' && (
              <View style={s.chipWrap}>
                {LANGS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label ?? store.t(o.key!)}
                    selected={store.language === o.value}
                    onPress={() => pick({ language: o.value })}
                  />
                ))}
              </View>
            )}

            {editing === 'weekStart' && (
              <View style={s.chipWrap}>
                {(['Monday', 'Sunday'] as WeekStart[]).map((w) => (
                  <Chip key={w} label={dayName(w)} selected={store.weekStart === w} onPress={() => pick({ weekStart: w })} />
                ))}
              </View>
            )}

            {editing !== 'reminder' && editing !== 'weekStart' && editing !== 'language' && editing !== 'quickLogFocus' && editing !== 'streaks' && editing !== 'autoBackup' && (
              <Pressable style={s.saveBtn} onPress={save}>
                <Text style={s.saveBtnText}>{store.t('settings.save')}</Text>
              </Pressable>
            )}
      </Sheet>
      <ProgressLayoutSheet visible={layoutOpen} onClose={() => setLayoutOpen(false)} />
    </ScrollView>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  page: { paddingHorizontal: 24, paddingBottom: 40, gap: 36 },
  name: { marginTop: 28, fontFamily: F.head, fontSize: fs(34), lineHeight: fs(40), letterSpacing: -0.4, color: C.ink },
  sub: { marginTop: 4, fontFamily: F.body, fontSize: fs(17), color: C.subStrong },
  statUnit: { fontFamily: F.body, fontWeight: '400', fontSize: fs(17), color: C.subStrong },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, gap: 10, borderBottomWidth: 1, borderBottomColor: C.hairline },
  rowClose: { borderBottomWidth: 3, borderBottomColor: C.barline },
  rowLabel: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: F.body, fontSize: fs(16), color: C.subStrong },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontFamily: F.head, fontSize: fs(22), color: C.ink },
  input: { height: 48, borderBottomWidth: 1, borderBottomColor: C.staffLine, paddingHorizontal: 0, fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wheelSave: { height: 48, borderRadius: r(12), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  wheelSaveText: { color: C.bg, fontFamily: F.bodyMed, fontSize: fs(15) },
  inputLabel: { fontFamily: F.bodySemi, fontSize: fs(13), color: C.sub, marginBottom: 8 },
  editorHint: { fontFamily: F.body, fontSize: fs(12.5), color: C.subStrong, marginTop: -6 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moveBtn: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontFamily: F.body, fontSize: fs(17), color: C.subStrong },
  addStageBtn: { height: 44, borderRadius: r(12), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  addStageText: { fontFamily: F.bodyMed, fontSize: fs(14), color: C.sub },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: r(12), backgroundColor: C.track, alignItems: 'center', justifyContent: 'center' },
  chipSel: { borderColor: C.accent, backgroundColor: C.accentTint },
  chipText: { fontFamily: F.bodyMed, fontSize: fs(13.5), color: C.ink },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.hairline },
  dataLabel: { fontFamily: F.bodyMed, fontSize: fs(16), color: C.ink },
  dataSub: { fontFamily: F.body, fontSize: fs(14.5), color: C.subStrong, marginTop: 1 },
  version: { fontFamily: F.body, fontSize: fs(12), color: C.sub, textAlign: 'center', marginTop: 4 },
  dataFoot: { marginTop: 12, fontFamily: F.body, fontSize: fs(14.5), lineHeight: fs(20), color: C.sub },
  saveBtn: { height: 52, borderRadius: r(14), backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveBtnText: { fontFamily: F.bodySemi, fontSize: fs(16), color: C.bg },
}));
