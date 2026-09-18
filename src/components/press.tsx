// The app's Pressable: React Native's, plus a spring scale-down while the finger
// is on it, so every tap answers within a frame. Drop-in — same props, function
// styles included — which is why every screen imports `Pressable` from here.
// Off under the reduce-motion setting.
import React, { useState } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';

const APressable = Animated.createAnimatedComponent(RNPressable);
const SPRING = { damping: 20, stiffness: 400, mass: 0.5 };
// a parameter, not a closed-over hook value: the hooks lint forbids writing the latter outside an effect
const springTo = (sv: SharedValue<number>, to: number) => {
  sv.value = withSpring(to, SPRING);
};

export function Pressable({ style, onPressIn, onPressOut, ...p }: PressableProps) {
  const { reduceMotion } = useTheme();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // A function style still gets React Native's state; the animated style rides on top.
  // PressableStateCallbackType is { pressed } in React Native and { pressed, hovered }
  // once expo/types augments it for web — and that augmentation only loads through
  // expo-env.d.ts, which is gitignored and generated on first run. So tsc sees one
  // shape on a clean clone and the other on a machine that has run the app, and an
  // object literal fails one of them either way: too few keys here, an excess key there.
  // Passing a variable instead sidesteps the excess property check, which only applies
  // to fresh literals, while still carrying `hovered` for the augmented shape.
  const state = { pressed, hovered: false };
  const resolved = (typeof style === 'function' ? style(state) : style) as StyleProp<ViewStyle>;
  const pressIn: PressableProps['onPressIn'] = (e) => {
    setPressed(true);
    springTo(scale, 0.96);
    onPressIn?.(e);
  };
  const pressOut: PressableProps['onPressOut'] = (e) => {
    setPressed(false);
    springTo(scale, 1);
    onPressOut?.(e);
  };
  return <APressable {...p} style={[resolved, !reduceMotion && anim]} onPressIn={pressIn} onPressOut={pressOut} />;
}
