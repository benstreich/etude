// Pushes the widget snapshot to the native side (#17, feature 6) whenever
// today's numbers change. Renders nothing; a no-op in Expo Go and on web.
import { useEffect } from 'react';

import EtudeWidgets from '../../modules/etude-widgets';
import { useStore } from '@/lib/store';

export function WidgetSync() {
  const store = useStore();
  const nextFocus =
    store.quickLogFocus?.name ??
    store.pieces.find((p) => !p.archived && p.stage < store.stages.length - 1)?.name ??
    null;
  const payload = JSON.stringify({
    today: store.todayMin,
    goal: store.dailyGoal,
    streak: store.streakMode === 'off' ? 0 : store.displayStreak,
    week: store.week.map((w) => w.min),
    nextFocus,
  });
  useEffect(() => {
    EtudeWidgets?.setWidgetData(JSON.parse(payload));
  }, [payload]);
  return null;
}
