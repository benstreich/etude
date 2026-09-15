import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TextProps,
  useWindowDimensions,
  View,
  ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
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
 */

/**
 * Bottom sheet in a <Modal> that can never be taller than the window it lives in (#75).
 * The dialog window shrinks when the keyboard opens; a sheet sized
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
        <View pointerEvents="box-none" style={[s.avoid, { paddingTop: insets.top }]}>
          <Pressable style={[s.sheet, { maxHeight: winH - insets.top - 12 }, fill && s.sheetFill, style]} onPress={() => {}}>
            {grabber && <View style={s.grabber} />}
            <KeyboardAwareScrollView
              style={fill ? s.scrollFill : s.scroll}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              bottomOffset={16}
              contentContainerStyle={[align === 'bottom' && s.contentBottom, contentStyle]}>
              {children}
            </KeyboardAwareScrollView>
          </Pressable>
          </View>
        </Pressable>
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
  return <Animated.View entering={reduceMotion ? undefined : CARD_IN} style={[s.card, style]} {...p} />;
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
