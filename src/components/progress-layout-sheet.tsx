import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Pressable } from '@/components/press';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/text';
import { Sheet } from '@/components/ui';
import { availabilityFrom, countOnSections, sectionUnavailable, type Unavailable } from '@/lib/progress-availability';
import { resolveLayout, type LayoutItem } from '@/lib/progress-sections';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

const ROW_H = 64;
// the row text stops growing with the OS font here, so the computed height always holds it
const MAX_OS_SCALE = 1.6;

/**
 * Which progress definitions show, in which order. Long-press the handle and drag
 * to reorder; every change saves at once. Empty saved layout = registry default.
 */
export function ProgressLayoutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useS();
  const { C, fs } = useTheme();
  const store = useStore();
  const { fontScale } = useWindowDimensions();
  // rows are absolutely placed for the drag, so their height is computed, not measured:
  // a label line and two description lines at the app's and the OS's text size (64 at the defaults)
  const rowH = Math.max(ROW_H, Math.ceil((fs(15) + fs(12.5) * 2) * 1.35 * Math.min(fontScale, MAX_OS_SCALE) + 10));
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
  // a whole custom layout has no undo, so ask first — and there is nothing to ask about on the default
  const reset = () => {
    if (!store.progressLayout?.length) return;
    Alert.alert(store.t('settings.resetLayoutTitle'), store.t('settings.resetLayoutBody'), [
      { text: store.t('settings.cancel'), style: 'cancel' },
      { text: store.t('settings.resetLayoutConfirm'), style: 'destructive', onPress: () => save([]) },
    ]);
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
      <View style={{ height: n * rowH }}>
        {layout.map((l, i) => (
          <Row
            key={l.key}
            index={i}
            count={n}
            rowH={rowH}
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
      <Pressable testID="layout-reset" style={s.reset} hitSlop={8} accessibilityRole="button" onPress={reset}>
        <Text style={[s.resetText, { color: C.accent }]}>{store.t('settings.resetDefault')}</Text>
      </Pressable>
    </Sheet>
  );
}

function Row({
  index,
  count,
  rowH,
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
  rowH: number;
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
  const name = store.t(`progress.section.${item.key}`);
  // the drag is a long-press pan, which a screen reader cannot perform; these actions are its stand-in.
  // A swipe up (increment) moves the row up the list, the direction the finger went.
  const a11yMove = (action: string) => {
    const to = action === 'increment' || action === 'moveUp' ? index - 1 : action === 'decrement' || action === 'moveDown' ? index + 1 : index;
    if (to >= 0 && to < count) onMove(index, to);
  };

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
      const to = Math.max(0, Math.min(count - 1, index + Math.round(dragY.get() / rowH)));
      scheduleOnRN(onMove, index, to);
    })
    .onFinalize(() => {
      active.set(-1);
      dragY.set(0);
      scheduleOnRN(onDragState, false);
    });

  const style = useAnimatedStyle(() => {
    const a = active.get();
    if (a === -1) return { top: index * rowH, transform: [{ translateY: 0 }], zIndex: 0 };
    if (a === index) return { top: index * rowH, transform: [{ translateY: dragY.get() }], zIndex: 10 };
    // rows the dragged one has crossed slide out of its way
    const target = Math.max(0, Math.min(count - 1, a + Math.round(dragY.get() / rowH)));
    const shift = index > a && index <= target ? -rowH : index < a && index >= target ? rowH : 0;
    return { top: index * rowH, transform: [{ translateY: withTiming(shift, { duration: 120 }) }], zIndex: 0 };
  });

  return (
    <Animated.View style={[s.row, { height: rowH }, style]}>
      <GestureDetector gesture={pan}>
        <View
          style={s.handle}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${name}, ${store.t('settings.dragToReorder')}`}
          // an adjustable announces its value after each step, so the reader hears where the row landed
          accessibilityValue={{ text: store.t('settings.nOfM', { n: index + 1, m: count }) }}
          accessibilityActions={[
            { name: 'increment', label: store.t('settings.moveUp') },
            { name: 'decrement', label: store.t('settings.moveDown') },
            { name: 'moveUp', label: store.t('settings.moveUp') },
            { name: 'moveDown', label: store.t('settings.moveDown') },
          ]}
          onAccessibilityAction={(e) => a11yMove(e.nativeEvent.actionName)}>
          {[0, 1, 2].map((k) => (
            <View key={k} style={[s.handleLine, { backgroundColor: C.chartInactive }]} />
          ))}
        </View>
      </GestureDetector>
      <View style={{ flex: 1, opacity: blocked ? 0.55 : 1 }}>
        <Text style={s.label} numberOfLines={1} maxFontSizeMultiplier={MAX_OS_SCALE}>
          {name}
        </Text>
        <Text style={blocked ? s.blocked : s.desc} numberOfLines={2} maxFontSizeMultiplier={MAX_OS_SCALE}>
          {blocked
            ? store.t(`progress.unavailable.${blocked.reason}`, { have: blocked.have, need: blocked.need })
            : store.t(`progress.sectionDesc.${item.key}`)}
        </Text>
      </View>
      <Switch
        testID={`layout-switch-${item.key}`}
        accessibilityLabel={name}
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
  row: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.hairline, backgroundColor: C.card },
  handle: { width: 28, height: 40, justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  handleLine: { height: 2, borderRadius: r(1) },
  label: { fontFamily: F.bodyMed, fontSize: fs(15), color: C.ink },
  desc: { fontFamily: F.body, fontSize: fs(12.5), color: C.sub, marginTop: 1 },
  blocked: { fontFamily: F.body, fontSize: fs(12.5), color: C.tertiary, marginTop: 1, fontStyle: 'italic' },
  reset: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  resetText: { fontFamily: F.bodySemi, fontSize: fs(14) },
}));
