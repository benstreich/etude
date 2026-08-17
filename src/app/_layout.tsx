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
import { View } from 'react-native';

import { BarsIcon, ClockIcon, HomeIcon, NoteIcon, PersonIcon } from '@/components/icons';
import { Toast } from '@/components/toast';
import { StoreProvider } from '@/lib/store';
import { C, F } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
            sceneStyle: { backgroundColor: C.bg },
            tabBarActiveTintColor: C.accent,
            tabBarInactiveTintColor: C.sub,
            tabBarStyle: { backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.cardBorder, elevation: 0 },
            tabBarLabelStyle: { fontFamily: F.bodyMed, fontSize: 10.5 },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
          <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: ({ color }) => <ClockIcon color={color} /> }} />
          <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color }) => <BarsIcon color={color} /> }} />
          <Tabs.Screen name="repertoire" options={{ title: 'Repertoire', tabBarIcon: ({ color }) => <NoteIcon color={color} /> }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <PersonIcon color={color} /> }} />
        </Tabs>
        <Toast />
      </View>
    </StoreProvider>
  );
}
