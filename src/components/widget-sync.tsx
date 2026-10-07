// Pushes the widget snapshot to the native side (#17, feature 6) whenever
// today's numbers change. Renders nothing; a no-op in Expo Go and on web.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import EtudeWidgets from '../../modules/etude-widgets';
import { applyAccentIcon, currentIconName } from '@/lib/app-icon';
import { mix } from '@/lib/heatmap-math';
import { useStore } from '@/lib/store';
import { computeStreak, graceFor } from '@/lib/streak-math';
import { ACCENTS } from '@/lib/theme';

// widget paper per scheme (modules/etude-widgets res/values(-night)/colors.xml); the
// mid and soft steps are the app's heatmap mix of accent into paper
const PAPER = { light: '#FAF7F2', dark: '#1F1B17' };
const triple = (accent: string, paper: string) => [accent, mix(accent, paper, 0.35), mix(accent, paper, 0.65)];

// How many days after `today` (a dateKey) the streak still stands if nothing more
// is logged, up to a week. The widget zeroes a rolled-over streak beyond that, so
// grace days, break days and a not-yet-practised today all count as in the app.
function streakDaysLeft(minutesByDate: Record<string, number>, breakDays: string[], grace: number, today: string) {
  const [y, m, d] = today.split('-').map(Number);
  let k = 0;
  while (k < 7 && computeStreak(minutesByDate, breakDays, grace, new Date(y, m - 1, d + k + 1)) > 0) k++;
  return k;
}

export function WidgetSync() {
  const store = useStore();
  const nextFocus =
    store.quickLogFocus?.name ??
    store.pieces.find((p) => !p.archived && p.stage < store.stages.length - 1)?.name ??
    null;
  const accent = ACCENTS[store.accent] ?? ACCENTS.terracotta;
  const streak = store.streakMode === 'off' ? 0 : store.displayStreak;
  const payload = JSON.stringify({
    // the native side rolls a stale snapshot over to the new day (A02) — the
    // widget repaints at midnight with nobody opening the app to push one
    day: store.today,
    today: store.todayMin,
    goal: store.dailyGoal,
    streak,
    streakDays: streak > 0 ? streakDaysLeft(store.minutesByDate, store.breakDays, graceFor(store.streakMode), store.today) : 0,
    week: store.week.map((w) => w.min),
    nextFocus,
    // #80: widgets follow the accent, in both schemes, since the launcher picks the scheme
    accentLight: triple(accent.light[0], PAPER.light),
    accentDark: triple(accent.dark[0], PAPER.dark),
    // the widget speaks the in-app language, not the launcher's
    labels: {
      minutesToday: store.t('widget.minutesToday'),
      min: store.t('widget.min'),
      practice: store.t('tabs.practice'),
      streak: store.t('home.streak', { count: streak }),
      next: nextFocus ? store.t('widget.next', { name: nextFocus }) : '',
    },
  });
  useEffect(() => {
    EtudeWidgets?.setWidgetData(JSON.parse(payload));
  }, [payload]);
  // #80: so does the launcher icon, when the user has asked for it (native build
  // only; a no-op elsewhere). Opt-in because Android swaps the icon by disabling
  // one launcher alias and enabling another, and the launcher then drops the
  // app's home-screen shortcut (it pointed at the old alias): the user has to
  // add Étude back. Only on launch and on leaving the app — some launchers close
  // the app on a switch, which mid-way through tapping the swatches would throw
  // the user out. A switch also leaves the widgets' tap intents pointing at the
  // disabled alias, so they are repainted straight after.
  const want = store.iconAccent ? store.accent : 'terracotta';
  const wantRef = useRef(want);
  const payloadRef = useRef(payload);
  useEffect(() => {
    wantRef.current = want;
    payloadRef.current = payload;
  }, [want, payload]);
  const apply = () =>
    applyAccentIcon(wantRef.current).then((changed) => {
      if (changed) EtudeWidgets?.setWidgetData(JSON.parse(payloadRef.current));
    });
  // an install that already runs an accent icon (the feature used to be automatic)
  // keeps it on, or the upgrade itself would swap the icon and lose the shortcut
  const adopt = useRef(store.updateSettings);
  useEffect(() => {
    adopt.current = store.updateSettings;
  });
  useEffect(() => {
    if (!store.iconAccent && currentIconName() !== null) {
      adopt.current({ iconAccent: true });
      return;
    }
    apply();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') apply();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
