import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextProps,
  useWindowDimensions,
  View,
  ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { useStore } from '@/lib/store';
import { F, themed, useC, type T } from '@/lib/theme';

/**
 * KeyboardAvoidingView behaviors. Android has two kinds of window here and they
 * react to the keyboard differently (#39, #48, #75):
 *
 * - A <Modal>'s dialog window: RN sets SOFT_INPUT_ADJUST_RESIZE on it and, with
 *   statusBarTranslucent off, fitsSystemWindows — so the window itself shrinks when
 *   the keyboard opens. Padding on top of that lifts the sheet twice. Sheets keep the
 *   KAV for its scroll-into-view but give it no behavior on Android.
 * - The activity window: Expo 57 draws edge-to-edge, and an edge-to-edge window no
 *   longer honours adjustResize (the framework stops applying the IME inset), so
 *   nothing moves. Full-screen views with a text field near the bottom need the
 *   padding on Android as well as iOS.
 *
 * iOS windows never resize, so both use padding there.
 */
export const SHEET_AVOID = Platform.OS === 'ios' ? ('padding' as const) : undefined;
export const SCREEN_AVOID = 'padding' as const;

/**
 * Bottom sheet in a <Modal> that can never be taller than the window it lives in (#75).
 * The dialog window shrinks when the keyboard opens (see SHEET_AVOID); a sheet sized
 * from useWindowDimensions did not, so its top ran off the screen and anything up
 * there — the repertoire search field, a title — became invisible. Here the sheet is
 * flex-sized against the window and scrolls inside, so the keyboard only ever makes
 * it shorter. `fill` gives the full-height look; `align="bottom"` keeps a short form
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
  const insets = useSafeAreaInsets();
  const winH = useWindowDimensions().height;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* A Modal is its own native view tree, so the app's root handler in _layout
          does not reach inside it: without this, gestures in a sheet never fire. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={SHEET_AVOID} pointerEvents="box-none" style={[s.avoid, { paddingTop: insets.top }]}>
          <Pressable style={[s.sheet, { maxHeight: winH - insets.top - 12 }, fill && s.sheetFill, style]} onPress={() => {}}>
            {grabber && <View style={s.grabber} />}
            <ScrollView
              style={fill ? s.scrollFill : s.scroll}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[align === 'bottom' && s.contentBottom, contentStyle]}>
              {children}
            </ScrollView>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const Card = ({ style, ...p }: ViewProps) => {
  const s = useS();
  return <View style={[s.card, style]} {...p} />;
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
        <Pressable key={n} disabled={!onChange} hitSlop={4} onPress={() => onChange?.(value === n ? undefined : n)} accessibilityLabel={`${n}`}>
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

/** Current instrument filter, or '' when it is "All" or there is nothing to filter by. */
export const useInstrumentFilter = () => {
  const store = useStore();
  return store.instruments.length > 1 && store.instruments.includes(store.instrumentFilter) ? store.instrumentFilter : '';
};

export const Bar = ({ pct, color, height = 4 }: { pct: number; color?: string; height?: number }) => {
  const C = useC();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, pct)}%`, height, borderRadius: height / 2, backgroundColor: color ?? C.ink }} />
    </View>
  );
};

const useS = themed(({ C, fs, r }: T) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(28,26,23,0.4)', justifyContent: 'flex-end' },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: r(22), borderTopRightRadius: r(22), padding: 24, paddingBottom: 40, flexShrink: 1 },
  sheetFill: { flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollFill: { flex: 1 },
  contentBottom: { flexGrow: 1, justifyContent: 'flex-end' },
  grabber: { width: 36, height: 4.5, borderRadius: r(999), backgroundColor: C.chartInactive, alignSelf: 'center', marginBottom: 16 },
  segTrack: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.track, borderRadius: r(999), padding: 2.5 },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: r(999), alignItems: 'center', justifyContent: 'center', maxWidth: 120 },
  segBtnSel: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: F.bodySemi, fontSize: fs(12), color: C.sub },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: r(16),
    padding: 20,
  },
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
}));
