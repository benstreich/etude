import { Newsreader_400Regular_Italic, Newsreader_500Medium_Italic } from '@expo-google-fonts/newsreader';
import { NotoMusic_400Regular } from '@expo-google-fonts/noto-music';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
// `Tabs` from the 'expo-router' barrel is deprecated in favour of the
// dedicated entrypoint (Expo 57) — same underlying navigator, but this is
// the only path that still exports `BottomTabBarProps` for a custom tabBar.
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Pressable } from '@/components/press';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Svg, { Circle, Path } from 'react-native-svg';

import { ClockIcon, MetronomeIcon, NoteIcon } from '@/components/icons';
import { FERMATA_D } from '@/components/motifs';
import { Onboarding } from '@/components/onboarding';
import { Text } from '@/components/text';
import { Toast } from '@/components/toast';
import { WidgetSync } from '@/components/widget-sync';
import { MetronomeProvider } from '@/lib/metronome';
import { resolvePlan, useActiveRun, useTransientPlan } from '@/lib/plan-run-state';
import { StoreProvider, useStore } from '@/lib/store';
import { F, useTheme } from '@/lib/theme';

const NAV_H = 74;

SplashScreen.preventAutoHideAsync();

function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const { reduceMotion } = useTheme();
  const t = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    t.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [focused, t, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.18 * t.value }, { translateY: -1.5 * t.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function NavItem({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  const { C } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10 }}>
      <TabIcon focused={active}>{icon}</TabIcon>
      <Text style={{ fontFamily: F.bodySemi, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: active ? C.accent : C.sub }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The staff nav: Home (fermata) · Practice · Repertoire · Tools. Only shows on those
 * four screens (Practice sets tabBarStyle.display:'none' once a session starts);
 * every other screen uses a BackLink instead.
 * ponytail: doesn't replicate tabBarHideOnKeyboard — the one screen that needs it
 * (Practice's search field) already hides this bar for its own reason once running.
 */
function StaffNav({ state, navigation, descriptors, insets }: BottomTabBarProps) {
  const { C } = useTheme();
  const store = useStore();
  const route = state.routes[state.index];
  const tabBarStyle = descriptors[route.key]?.options.tabBarStyle as { display?: string } | undefined;
  if (tabBarStyle?.display === 'none') return null;
  if (!['index', 'repertoire', 'tools', 'practice'].includes(route.name)) return null;
  const color = (name: string) => (route.name === name ? C.accent : C.sub);
  const items: { name: string; label: string; icon: React.ReactNode }[] = [
    {
      name: 'index',
      label: store.t('tabs.home'),
      // the fermata from the logomark: Home is the app's own mark, far left
      icon: (
        <Svg width={22} height={22} viewBox="2 5 36 28.8">
          <Path d={FERMATA_D} fill="none" stroke={color('index')} strokeWidth={3.4} strokeLinecap="round" />
          <Circle cx={20} cy={27} r={3.4} fill={C.logoDot} />
        </Svg>
      ),
    },
    { name: 'practice', label: store.t('tabs.practice'), icon: <ClockIcon size={22} color={color('practice')} /> },
    { name: 'repertoire', label: store.t('tabs.repertoire'), icon: <NoteIcon size={22} color={color('repertoire')} /> },
    { name: 'tools', label: store.t('tabs.tools'), icon: <MetronomeIcon size={22} color={color('tools')} /> },
  ];
  return (
    <View style={{ backgroundColor: C.bg, paddingBottom: insets.bottom }}>
      <View style={{ height: 1, backgroundColor: C.cardBorder, marginHorizontal: 24 }} />
      <View style={{ height: NAV_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 12 }}>
        {items.map((it) => (
          <NavItem key={it.name} icon={it.icon} label={it.label} active={route.name === it.name} onPress={() => navigation.navigate(it.name)} />
        ))}
      </View>
    </View>
  );
}

export default function RootLayout() {
  const insets = useSafeAreaInsets();
  const [loaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium_Italic,
    NotoMusic_400Regular,
    // SMuFL reference font (Steinberg, OFL) — the melody staff's real engraving
    Bravura: require('../../assets/fonts/Bravura.otf'),
  });

  if (!loaded) return null;

  return (
    // the root gesture handler the score viewer's pinch/pan needs (#60)
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Reports the real keyboard inset animation. Edge-to-edge killed
          adjustResize, so nothing below can rely on the window shrinking. */}
      <KeyboardProvider>
        <StoreProvider>
          <MetronomeProvider>
            <Shell insets={insets} />
          </MetronomeProvider>
        </StoreProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

// Way back into a running routine from any tab — the runner screen itself has
// no tab, so without this the run looks lost the moment you switch away
function RunPill({ bottom }: { bottom: number }) {
  const { C } = useTheme();
  const { plans, t } = useStore();
  const active = useActiveRun();
  useTransientPlan(); // the suggested session (#95) is a plan the store never sees
  const pathname = usePathname();
  const router = useRouter();
  const plan = active && resolvePlan(plans, active.planId);
  if (!plan || pathname === '/plan/run') return null;
  return (
    <Pressable
      style={{
        position: 'absolute',
        bottom,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.accent,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 18,
      }}
      onPress={() => router.push({ pathname: '/plan/run', params: { id: plan.id } })}>
      <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.bg }}>
        ▶ {t('planRun.inProgress', { name: plan.name })}
      </Text>
    </Pressable>
  );
}

function Shell({ insets }: { insets: { bottom: number } }) {
  const { C, dark } = useTheme();
  const { onboarded, t } = useStore();
  // Shell only mounts once fonts AND the store are ready (StoreProvider renders
  // null until hydration) — hiding here avoids a bare-window flash on cold start
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  // first run: the whole flow replaces the tab navigator, so no tab bar to hide
  if (!onboarded)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Onboarding />
        <Toast />
      </View>
    );
  return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Tabs
            // back goes to the previous screen, not to Home (#85)
            backBehavior="history"
            tabBar={(p) => <StaffNav {...p} />}
            screenOptions={{
              headerShown: false,
              animation: 'shift',
              sceneStyle: { backgroundColor: C.bg },
            }}>
            <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
            {/* the staff nav shows while idle and hides once a session starts */}
            <Tabs.Screen name="practice" options={{ title: t('tabs.practice') }} />
            <Tabs.Screen name="repertoire" options={{ title: t('tabs.repertoire') }} />
            <Tabs.Screen name="tools" options={{ title: t('tabs.tools') }} />
            {/* settings lives behind the gear in Home's header; progress stays as a deep-link route */}
            <Tabs.Screen name="progress" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
            <Tabs.Screen name="metronome" options={{ href: null }} />
            <Tabs.Screen name="drone" options={{ href: null }} />
            <Tabs.Screen name="learn" options={{ href: null }} />
            <Tabs.Screen name="appearance" options={{ href: null }} />
            <Tabs.Screen name="piece/[id]" options={{ href: null }} />
            <Tabs.Screen name="plan/[id]" options={{ href: null }} />
            <Tabs.Screen name="plan/run" options={{ href: null }} />
            <Tabs.Screen name="compare" options={{ href: null }} />
            <Tabs.Screen name="tuner" options={{ href: null }} />
            <Tabs.Screen name="score" options={{ href: null }} />
            <Tabs.Screen name="piece-score" options={{ href: null }} />
          </Tabs>
          <RunPill bottom={NAV_H + insets.bottom + 12} />
          <Toast />
          <WidgetSync />
        </View>
  );
}
