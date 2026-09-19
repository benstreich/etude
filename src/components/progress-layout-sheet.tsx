import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Pressable } from '@/components/press';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/text';
import { Sheet } from '@/components/ui';
import { availabilityFrom, countOnSections, sectionUnavailable, type Unavailable } from '@/lib/progress-availability';
import { resolveLayout, type LayoutItem } from '@/lib/progress-sections';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

const ROW_H = 64;

/**
 * Which progress definitions show, in which order. Long-press the handle and drag
 * to reorder; every change saves at once. Empty saved layout = registry default.
 */
export function ProgressLayoutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const C = useC();
  const store = useStore();
  const layout = resolveLayout(store.progressLayout);
  const blockedBy = availabilityFrom(store);
  const [dragging, setDragging] = useState(false);
  const active = useSharedValue(-1); // index of the row being dragged
  const dragY = useSharedValue(0);

  const save = (next: LayoutItem[]) => store.updateSettings({ progressLayout: next });
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...layout];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    save(next);
  };
  const n = layout.length;
  // what the switches below actually show: a blocked section draws as off
  const on = countOnSections(layout, blockedBy);

  return (
    <Sheet visible={visible} onClose={onClose} grabber fill scrollEnabled={!dragging}>
      <View style={s.head}>
        <Text style={s.title}>{store.t('settings.progressSections')}</Text>
        <Text style={s.count}>{store.t('settings.nOfM', { n: on, m: n })}</Text>
      </View>
      <Text style={s.help}>{store.t('settings.progressSectionsHelp')}</Text>
      <View style={{ height: n * ROW_H }}>
        {layout.map((l, i) => (
          <Row
            key={l.key}
            index={i}
            count={n}
            item={l}
            blocked={sectionUnavailable(l.key, blockedBy)}
            active={active}
            dragY={dragY}
            onToggle={(v) => save(layout.map((x) => (x.key === l.key ? { key: x.key, on: v } : x)))}
            onDragState={setDragging}
            onMove={move}
          />
        ))}
      </View>
      <Pressable style={s.reset} hitSlop={8} onPress={() => save([])}>
        <Text style={[s.resetText, { color: C.accent }]}>{store.t('settings.resetDefault')}</Text>
      </Pressable>
    </Sheet>
  );
}

function Row({
  index,
  count,
  item,
  blocked,
  active,
  dragY,
  onToggle,
  onDragState,
  onMove,
}: {
  index: number;
  count: number;
  item: { key: string; on: boolean };
  blocked: Unavailable | null;
  active: SharedValue<number>;
  dragY: SharedValue<number>;
  onToggle: (v: boolean) => void;
  onDragState: (d: boolean) => void;
  onMove: (from: number, to: number) => void;
}) {
  const s = useS();
  const C = useC();
  const store = useStore();

  // long-press first so a plain vertical swipe still scrolls the sheet
  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      active.set(index);
      dragY.set(0);
      scheduleOnRN(onDragState, true);
    })
    .onUpdate((e) => {
      dragY.set(e.translationY);
    })
    .onEnd(() => {
      const to = Math.max(0, Math.min(count - 1, index + Math.round(dragY.get() / ROW_H)));
      scheduleOnRN(onMove, index, to);
    })
    .onFinalize(() => {
      active.set(-1);
      dragY.set(0);
      scheduleOnRN(onDragState, false);
    });

  const style = useAnimatedStyle(() => {
    const a = active.get();
    if (a === -1) return { top: index * ROW_H, transform: [{ translateY: 0 }], zIndex: 0 };
    if (a === index) return { top: index * ROW_H, transform: [{ translateY: dragY.get() }], zIndex: 10 };
    // rows the dragged one has crossed slide out of its way
    const target = Math.max(0, Math.min(count - 1, a + Math.round(dragY.get() / ROW_H)));
    const shift = index > a && index <= target ? -ROW_H : index < a && index >= target ? ROW_H : 0;
    return { top: index * ROW_H, transform: [{ translateY: withTiming(shift, { duration: 120 }) }], zIndex: 0 };
  });

  return (
    <Animated.View style={[s.row, style]}>
      <GestureDetector gesture={pan}>
        <View style={s.handle} accessibilityLabel={store.t('settings.dragToReorder')}>
          {[0, 1, 2].map((k) => (
            <View key={k} style={[s.handleLine, { backgroundColor: C.chartInactive }]} />
          ))}
        </View>
      </GestureDetector>
      <View style={{ flex: 1, opacity: blocked ? 0.55 : 1 }}>
        <Text style={s.label}>{store.t(`progress.section.${item.key}`)}</Text>
        <Text style={blocked ? s.blocked : s.desc} numberOfLines={2}>
          {blocked
            ? store.t(`progress.unavailable.${blocked.reason}`, { have: blocked.have, need: blocked.need })
            : store.t(`progress.sectionDesc.${item.key}`)}
        </Text>
      </View>
      <Switch
        value={item.on && !blocked}
        disabled={!!blocked}
        onValueChange={onToggle}
        trackColor={{ true: C.accent, false: C.track }}
        thumbColor="#FFFFFF"
      />
    </Animated.View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontFamily: F.head, fontSize: fs(20), color: C.ink },
  count: { fontFamily: F.bodyMed, fontSize: fs(13), color: C.sub },
  help: { fontFamily: F.body, fontSize: fs(13), lineHeight: fs(18), color: C.sub, marginBottom: 10 },
  row: { position: 'absolute', left: 0, right: 0, height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.hairline, backgroundColor: C.card },
  handle: { width: 28, height: 40, justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  handleLine: { height: 2, borderRadius: r(1) },
  label: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  desc: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  blocked: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, marginTop: 1, fontStyle: 'italic' },
  reset: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  resetText: { fontFamily: F.bodySemi, fontSize: fs(14) },
}));
