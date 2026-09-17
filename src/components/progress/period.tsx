import React, { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Segmented } from '@/components/segmented';
import { Overline } from '@/components/ui';
import { dateKey, type FocusPeriod, type Session, useStore } from '@/lib/store';

const PERIODS: { key: FocusPeriod; labelKey: string; days: number | null }[] = [
  { key: '7d', labelKey: 'progress.period7d', days: 7 },
  { key: '30d', labelKey: 'progress.period30d', days: 30 },
  { key: 'all', labelKey: 'progress.periodAll', days: null },
];

/**
 * A section's own 7d / 30d / All picker. Only the sections that actually cut
 * their data by time use it, so it sits in their card head instead of once at
 * the top of the list.
 * ponytail: per-section state lives in the component, not the store — every
 * card starts on the saved default and forgets on remount; persist a map if that grates.
 */
export function usePeriod(sessions: Session[]) {
  const store = useStore();
  const [period, setPeriod] = useState<FocusPeriod>(store.focusPeriod);
  const p = PERIODS.find((x) => x.key === period) ?? PERIODS[1];
  const cutoffDate = new Date(store.now); // setDate, not fixed 24h ms, so the cutoff survives DST
  cutoffDate.setDate(cutoffDate.getDate() - ((p.days ?? 1) - 1));
  const cutoff = p.days ? dateKey(cutoffDate) : '';
  const inPeriod = sessions.filter((sess) => sess.date >= cutoff);
  const picker = <Segmented value={period} onChange={setPeriod} options={PERIODS.map((x) => ({ key: x.key, label: store.t(x.labelKey) }))} />;
  return { period, inPeriod, picker };
}

/** Card head: overline left, the picker right. */
export function PeriodHead({ title, picker, style }: { title: string; picker: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, style]}>
      <Overline>{title}</Overline>
      {picker}
    </View>
  );
}
