// Pushes the widget snapshot to the native side (#17, feature 6) whenever
// today's numbers change. Renders nothing; a no-op in Expo Go and on web.
import { useEffect } from 'react';

import EtudeWidgets from '../../modules/etude-widgets';
import { applyAccentIcon } from '@/lib/app-icon';
import { mix } from '@/lib/heatmap-math';
import { useStore } from '@/lib/store';
import { ACCENTS } from '@/lib/theme';

// widget paper per scheme (modules/etude-widgets res/values(-night)/colors.xml); the
// mid and soft steps are the app's heatmap mix of accent into paper
const PAPER = { light: '#FAF7F2', dark: '#1F1B17' };
const triple = (accent: string, paper: string) => [accent, mix(accent, paper, 0.35), mix(accent, paper, 0.65)];

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
  // #80: so does the launcher icon (native build only; a no-op elsewhere)
  useEffect(() => {
    applyAccentIcon(store.accent);
  }, [store.accent]);
  return null;
}
