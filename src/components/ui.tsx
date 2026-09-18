import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, TextProps, useWindowDimensions, View, ViewProps, type StyleProp, type ViewStyle, Pressable as RNPressable } from 'react-native';
import { Pressable } from '@/components/press';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown, runOnJS, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { KeyboardAwareScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronIcon, SearchIcon } from '@/components/icons';
import { Text } from '@/components/text';
import { tap, thud } from '@/lib/haptics';
import { useStore } from '@/lib/store';
import { F, themed, useC, useTheme, type T } from '@/lib/theme';

/**
 * Keyboard handling, app-wide, lives in one place now (#39, #48, #75).
 *
 * Expo 57 draws edge-to-edge, and an edge-to-edge Android window no longer
 * honours adjustResize: the framework stops applying the IME inset, so the
 * window never shrinks and RN's own KeyboardAvoidingView — which waits for that
 * resize — has nothing to react to. Every screen and sheet left its focused
 * field under the keyboard.
 *
 * KeyboardAwareScrollView (react-native-keyboard-controller, the version Expo
 * pins for this SDK) subscribes to the inset animation itself and scrolls the
 * focused field into view. It works inside a Modal on Android, which the
 * Reanimated equivalent does not, and a sheet is a Modal.
 *
 * The library also forces every Modal window to SOFT_INPUT_ADJUST_NOTHING
 * (ModalAttachedWatcher.kt), so the dialog never shrinks: the keyboard simply
 * overlays the bottom of the sheet. A scroll view sized by its own content then
 * has nothing to scroll and the focused field stays covered. `useKeyboardLift`
 * pads the sheet's container by the live keyboard height so the whole sheet
 * rides up above it and, if it no longer fits, scrolls.
 */
// a parameter, not a closed-over hook value: the hooks lint forbids writing the latter outside an effect (see press.tsx)
const setSV = (sv: SharedValue<number>, to: number) => {
  'worklet';
  sv.value = to;
};

export function useKeyboardLift() {
  const { height } = useReanimatedKeyboardAnimation(); // negative while open
  return useAnimatedStyle(() => ({ paddingBottom: Math.abs(height.value) }));
}

/**
 * Bottom sheet in a <Modal> that can never be taller than the window it lives in (#75).
 * The sheet is flex-sized against the window and scrolls inside, and the container
 * lifts by the keyboard height (see above), so the keyboard only ever makes it
 * shorter. `fill` gives the full-height look; `align="bottom"` keeps a short form
 * within thumb reach at the bottom of it.
 */
export function Sheet({
  visible,
  onClose,
  children,
  fill,
  align = 'top',
  grabber,
  style,
  contentStyle,
  scrollEnabled = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  fill?: boolean;
  align?: 'top' | 'bottom';
  grabber?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean; // off while a row inside is being dragged
}) {
  const s = useS();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const winH = useWindowDimensions().height;
  const lift = useKeyboardLift();
  // the Modal has to outlive `visible` by one exit animation, or the sheet just
  // vanishes: `mounted` keeps the window, `shown` drives the slide
  const OUT_MS = reduceMotion ? 0 : 240;
  const [mounted, setMounted] = useState(visible);
  const shown = visible;
  // opening mounts in the same render (adjust-state-during-render, react.dev), so the
  // Modal shows on the first tap; only the delayed unmount after the slide needs an effect
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => setMounted(false), OUT_MS);
    return () => clearTimeout(t);
  }, [visible, OUT_MS]);
  // drag the grabber down to dismiss: the sheet follows the finger, springs back
  // if let go early, closes past a third of the way or on a flick. The pan lives on
  // the grabber zone only so it never fights the scroll view underneath it.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) setSV(drag, 0);
  }, [visible, drag]);
  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((e) => setSV(drag, Math.max(0, e.translationY)))
    .onEnd((e) => {
      if (drag.value > 110 || e.velocityY > 900) {
        runOnJS(thud)(true); // the sheet leaving your hand
        runOnJS(onClose)();
      } else setSV(drag, withSpring(0, { damping: 22, stiffness: 260 }));
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  return (
    <Modal visible={mounted} transparent animationType="fade" onRequestClose={onClose}>
      {/* A Modal is its own native view tree, so the app's root handler in _layout
          does not reach inside it: without this, gestures in a sheet never fire. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RNPressable style={s.backdrop} onPress={onClose}>
        {shown && (
        <Animated.View
          entering={reduceMotion ? undefined : SlideInDown.duration(380).easing(Easing.bezier(0.33, 1, 0.68, 1))}
          exiting={reduceMotion ? undefined : SlideOutDown.duration(OUT_MS).easing(Easing.bezier(0.32, 0, 0.67, 0))}
          style={[s.avoid, lift, dragStyle, { paddingTop: insets.top, pointerEvents: 'box-none' }]}>
          <RNPressable style={[s.sheet, { maxHeight: winH - insets.top - 12 }, fill && s.sheetFill, style]} onPress={() => {}}>
            <GestureDetector gesture={pan}>
              <View style={s.dragZone}>
                <View style={[s.grabber, !grabber && { opacity: 0.6 }]} />
              </View>
            </GestureDetector>
            <KeyboardAwareScrollView
              style={fill ? s.scrollFill : s.scroll}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              bottomOffset={16}
              contentContainerStyle={[align === 'bottom' && s.contentBottom, contentStyle]}>
              {children}
            </KeyboardAwareScrollView>
          </RNPressable>
          </Animated.View>
        )}
        </RNPressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Every card settles in with a short fade-up, the one motion the whole app
// shares; off under the reduce-motion setting.
const CARD_IN = FadeInDown.duration(320).easing(Easing.bezier(0.33, 1, 0.68, 1));
export const Card = ({ style, ...p }: ViewProps) => {
  const s = useS();
  const { reduceMotion } = useTheme();
  // ponytail: flat sections. `s.flat` comes last so callers' padding overrides keep their vertical
  // rhythm but lose the side inset: content lines up with the page gutter, sections are split by a hairline.
  return <Animated.View entering={reduceMotion ? undefined : CARD_IN} style={[s.card, style, s.flat]} {...p} />;
};

export const Overline = ({ style, ...p }: TextProps) => {
  const s = useS();
  return <Text style={[s.overline, style]} {...p} />;
};

export const ScreenTitle = ({ style, ...p }: TextProps) => {
  const s = useS();
  return <Text style={[s.title, style]} {...p} />;
};

/** 1–5 star rating row (#54). Tapping the current value clears it; `onChange` omitted = read-only. */
export const Stars = ({ value, onChange, size = 28 }: { value?: number; onChange?: (v: number | undefined) => void; size?: number }) => {
  const C = useC();
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.25 }} accessibilityRole="adjustable" accessibilityValue={{ now: value ?? 0, min: 0, max: 5 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          hitSlop={4}
          onPress={() => {
            tap();
            onChange?.(value === n ? undefined : n);
          }}
          accessibilityLabel={`${n}`}>
          <Text style={{ fontSize: size, lineHeight: size * 1.15, color: value !== undefined && n <= value ? C.accent : C.chartInactive }}>
            {value !== undefined && n <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

/**
 * All · Piano · Guitar segment (#58). Renders nothing with fewer than two
 * instruments; the choice is one shared setting so every tab shows the same slice.
 */
export const InstrumentFilter = ({ style }: { style?: ViewProps['style'] }) => {
  const s = useS();
  const C = useC();
  const store = useStore();
  if (store.instruments.length < 2) return null;
  const sel = store.instruments.includes(store.instrumentFilter) ? store.instrumentFilter : '';
  return (
    <View style={[s.segTrack, style]}>
      {['', ...store.instruments].map((inst) => (
        <Pressable key={inst} style={[s.segBtn, sel === inst && s.segBtnSel]} onPress={() => store.updateSettings({ instrumentFilter: inst })}>
          <Text style={[s.segText, sel === inst && { color: C.ink }]} numberOfLines={1}>
            {inst || store.t('common.all')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

/**
 * The list search on Practice and Repertoire. One component because the two
 * screens are the same screen with different verbs, and hand-matched copies had
 * already drifted — different font size, border colour and row height.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useS();
  const C = useC();
  return (
    <View style={[s.searchField, style]}>
      <SearchIcon size={18} color={C.tertiary} />
      <TextInput
        style={s.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.tertiary}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/**
 * A section heading that folds its contents away. The chevron turns; the open
 * state belongs to the caller so it can be persisted (Techniques remembers it).
 */
export function SectionHead({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  const s = useS();
  const C = useC();
  return (
    <Pressable hitSlop={8} style={s.sectionHead} onPress={onToggle}>
      <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
        <ChevronIcon color={C.tertiary} size={10} />
      </View>
      <Overline>{label}</Overline>
    </Pressable>
  );
}

/** Current instrument filter, or '' when it is "All" or there is nothing to filter by. */
export const useInstrumentFilter = () => {
  const store = useStore();
  return store.instruments.length > 1 && store.instruments.includes(store.instrumentFilter) ? store.instrumentFilter : '';
};

export const Bar = ({ pct, color, height = 4 }: { pct: number; color?: string; height?: number }) => {
  const { C, reduceMotion } = useTheme();
  const [w, setW] = useState(0);
  const target = (Math.min(100, Math.max(0, pct)) / 100) * w;
  const fill = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || fill.value === 0) fill.value = target;
    else if (target > fill.value) fill.value = withSpring(target, { damping: 13, stiffness: 120, mass: 0.8 }); // the reward moment gets a little overshoot
    else fill.value = withTiming(target, { duration: 500, easing: Easing.bezier(0.33, 1, 0.68, 1) });
  }, [target, reduceMotion, fill]);
  const anim = useAnimatedStyle(() => ({ width: fill.value }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? C.ink }, anim]} />
    </View>
  );
};

/**
 * The redesign's one primary action per screen: hairline above, round key,
 * title + optional subline, double barline when it closes the page (or the
 * page's last group). `right` overrides the default chevron; pass `null` for none.
 */
export function EntryRow({
  onPress,
  disabled,
  testID,
  top = true,
  close = false,
  keySize = 56,
  keyStyle,
  keyContent,
  title,
  subline,
  right,
  style,
}: {
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  top?: boolean;
  close?: boolean;
  keySize?: number;
  keyStyle?: StyleProp<ViewStyle>;
  keyContent: React.ReactNode;
  title: string;
  subline?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useS();
  const C = useC();
  return (
    <Pressable
      testID={testID}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        s.entryRow,
        top && s.entryRowTop,
        close && s.entryRowClose,
        pressed && onPress && { transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      <View style={[s.entryKey, { width: keySize, height: keySize, borderRadius: keySize / 2 }, keyStyle]}>{keyContent}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.entryTitle}>{title}</Text>
        {subline ? typeof subline === 'string' ? (
          <Text style={s.entrySub} numberOfLines={1}>
            {subline}
          </Text>
        ) : (
          subline
        ) : null}
      </View>
      {right !== undefined ? right : onPress ? <ChevronIcon color={C.barline} size={14} /> : null}
    </Pressable>
  );
}

/** Sub-screen back navigation: chevron + label, in the header row. */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useS();
  const C = useC();
  return (
    <Pressable hitSlop={8} onPress={onPress} style={s.backLink}>
      <View style={{ transform: [{ scaleX: -1 }] }}>
        <ChevronIcon color={C.accent} size={12} />
      </View>
      <Text style={s.backLinkText}>{label}</Text>
    </Pressable>
  );
}

/** An option group as underlined text on one rule — time signature, instrument filter, and the like. */
export function UnderlineTabs<K extends string>({
  options,
  value,
  onChange,
  gap = 20,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (v: K) => void;
  gap?: number;
}) {
  const s = useS();
  const C = useC();
  return (
    <View style={[s.tabsRow, { gap }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.tabItem, { borderBottomColor: active ? C.accent : 'transparent' }]}>
            <Text style={[s.tabText, { color: active ? C.ink : C.sub }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Three (or more) ruled stat columns — piece stats, settings totals — instead of tiles. */
export function RuledStats({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  const s = useS();
  const C = useC();
  return (
    <View style={s.statsRow}>
      {items.map((it, i) => (
        <View key={i} style={[s.statCol, i < items.length - 1 && { borderRightWidth: 1, borderRightColor: C.staffLine }, i > 0 && { paddingLeft: 16 }]}>
          <Text style={s.overline} numberOfLines={1}>
            {it.label}
          </Text>
          {/* a third of the width cannot hold "Yesterday" at full size, so the value
              shrinks to fit rather than wrapping mid-word (#86) */}
          <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, flexShrink: 1 },
  sheetFill: { flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollFill: { flex: 1 },
  contentBottom: { flexGrow: 1, justifyContent: 'flex-end' },
  // a generous finger target around the 4.5px handle; the pan gesture lives here
  dragZone: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 2, paddingBottom: 12, marginTop: -6 },
  grabber: { width: 36, height: 4.5, borderRadius: r(999), backgroundColor: C.chartInactive },
  segTrack: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.track, borderRadius: r(999), padding: 2.5 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderBottomWidth: 1, borderBottomColor: C.staffLine },
  searchInput: { flex: 1, fontFamily: F.body, fontSize: fs(17), color: C.ink, padding: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: r(999), alignItems: 'center', justifyContent: 'center', maxWidth: 120 },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  card: { padding: 20 },
  flat: { backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.cardBorder, borderRadius: 0, paddingHorizontal: 0, paddingBottom: 24 },
  overline: {
    fontFamily: F.bodySemi,
    fontSize: fs(12),
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: C.tertiary,
  },
  title: {
    fontFamily: F.head,
    fontSize: fs(30),
    color: C.ink,
  },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18 },
  entryRowTop: { borderTopWidth: 1, borderTopColor: C.staffLine },
  entryRowClose: { borderBottomWidth: 3, borderBottomColor: C.barline },
  entryKey: { alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontFamily: F.head, fontSize: fs(20), lineHeight: fs(24), color: C.ink },
  entrySub: { marginTop: 2, fontFamily: F.body, fontSize: fs(16), lineHeight: fs(22), color: C.subStrong },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLinkText: { fontFamily: F.bodySemi, fontSize: fs(15), color: C.accent },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.staffLine },
  tabItem: { height: 36, justifyContent: 'center', borderBottomWidth: 2, marginBottom: -1 },
  tabText: { fontFamily: F.bodySemi, fontSize: fs(14) },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.staffLine, paddingVertical: 16 },
  statCol: { flex: 1 },
  statValue: { marginTop: 6, fontFamily: F.bodyMed, fontSize: fs(22), color: C.ink },
}));
