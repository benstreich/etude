// Small motion helpers shared by screens. All of them go still under the
// reduce-motion setting.
import React, { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';

// a parameter, not a closed-over hook value: the hooks lint forbids writing the latter outside an effect
const bumpTo = (sv: SharedValue<number>, peak: number) => {
  sv.value = withSequence(withTiming(peak, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 260, mass: 0.6 }));
};

/**
 * Swells to `peak` and springs back every time `trigger` changes to something
 * truthy — a streak count that just grew, a beat dot as its beat lands.
 * The first render never bumps; a mount is not an event.
 */
export function Bump({ trigger, peak = 1.18, style, children }: { trigger: unknown; peak?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const { reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (trigger && !reduceMotion) bumpTo(scale, peak);
  }, [trigger, peak, reduceMotion, scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
