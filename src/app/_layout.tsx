import { Figtree_600SemiBold, useFonts } from '@expo-google-fonts/figtree';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarsIcon, ClockIcon, GearIcon, HomeIcon, NoteIcon } from '@/components/icons';
import { Toast } from '@/components/toast';
import { StoreProvider } from '@/lib/store';
import { C, F } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const t = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(focused ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [focused, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.18 * t.value }, { translateY: -1.5 * t.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const [loaded] = useFonts({
    Figtree_600SemiBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <StoreProvider>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar style="dark" />
        <Tabs
          screenOptions={{
            headerShown: false,
            animation: 'shift',
            // plain Pressable kills Android's big gray ripple circle on tab taps
            tabBarButton: ({ children, onPress, onLongPress, accessibilityState, style, testID }) => (
              <Pressable
                onPress={onPress}
                onLongPress={onLongPress ?? undefined}
                accessibilityState={accessibilityState}
                testID={testID}
                style={style as any}>
                {children}
              </Pressable>
            ),
            sceneStyle: { backgroundColor: C.bg },
            tabBarActiveTintColor: C.accent,
            tabBarInactiveTintColor: C.sub,
            tabBarStyle: {
              backgroundColor: C.bg,
              borderTopWidth: 1,
              borderTopColor: C.cardBorder,
              elevation: 0,
              height: 56 + insets.bottom,
            },
            tabBarLabelStyle: { fontFamily: F.bodyMed, fontSize: 10.5, lineHeight: 14 },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><HomeIcon color={color} /></TabIcon> }} />
          <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><ClockIcon color={color} /></TabIcon> }} />
          <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><BarsIcon color={color} /></TabIcon> }} />
          <Tabs.Screen name="repertoire" options={{ title: 'Repertoire', tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><NoteIcon color={color} /></TabIcon> }} />
          <Tabs.Screen name="profile" options={{ title: 'Settings', tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><GearIcon color={color} /></TabIcon> }} />
        </Tabs>
        <Toast />
      </View>
    </StoreProvider>
  );
}
