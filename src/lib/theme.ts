// Design tokens from ../../README.md (Étude handoff), now themeable:
// light/dark palettes × accent, plus font/radius scale. Components get their
// styles via themed(sheet) hooks; buildTheme memoizes per settings change.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useStore } from './store';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentName = 'terracotta' | 'forest' | 'indigo' | 'ocean' | 'plum' | 'slate';
export type RadiusMode = 'sharp' | 'soft' | 'round';

const LIGHT = {
  bg: '#FAF7F2',
  card: '#FFFFFF',
  cardBorder: '#E8E2D6',
  ink: '#1C1A17',
  sub: '#8A8378',
  // readable small text (≈5.5:1 on bg) — tertiary/faint are decoration-only
  subStrong: '#6E675C',
  tertiary: '#A8A196',
  faint: '#C6BFB1',
  accent: '#B34A2E',
  accentDark: '#8F3A24',
  accentTint: '#FBEFE9',
  success: '#4A7C59',
  successTint: '#EDF3EA',
  track: '#EFEAE0',
  chartInactive: '#DDD5C6',
  hairline: '#F1ECE2',
  inputBorder: '#E0D9CB',
  logoDot: '#E8A87C',
};

// warm dark — same paper feel, lamp off
const DARK: Palette = {
  ...LIGHT,
  bg: '#151210',
  card: '#1F1B17',
  cardBorder: '#332C24',
  ink: '#EDE7DC',
  sub: '#9C9486',
  subStrong: '#A69D8E',
  tertiary: '#7A7264',
  faint: '#4E4739',
  success: '#6FA37E',
  successTint: '#1F2E24',
  track: '#2A251F',
  chartInactive: '#3B342B',
  hairline: '#28231E',
  inputBorder: '#3B342B',
};

export type Palette = typeof LIGHT;

// accent/accentDark/accentTint per scheme; dark accents run lighter so they read on dark paper
export const ACCENTS: Record<AccentName, { label: string; light: [string, string, string]; dark: [string, string, string] }> = {
  terracotta: { label: 'Terracotta', light: ['#B34A2E', '#8F3A24', '#FBEFE9'], dark: ['#D96B4A', '#B34A2E', '#39241C'] },
  forest: { label: 'Forest', light: ['#4A7C59', '#3A6246', '#EBF3ED'], dark: ['#6FA37E', '#4A7C59', '#1F2E24'] },
  indigo: { label: 'Indigo', light: ['#5B5BD6', '#4747AD', '#EEEEFB'], dark: ['#8385E8', '#5B5BD6', '#252547'] },
  ocean: { label: 'Ocean', light: ['#2E7DB3', '#24638F', '#E9F2FB'], dark: ['#5BA3D0', '#2E7DB3', '#1D2C3A'] },
  plum: { label: 'Plum', light: ['#9D4A8E', '#7C3A70', '#F8ECF6'], dark: ['#C273B4', '#9D4A8E', '#33202F'] },
  slate: { label: 'Slate', light: ['#556270', '#424C57', '#EDF0F3'], dark: ['#8A99A8', '#556270', '#262C33'] },
};

export const FONT_SCALES = [
  { label: 'Small', value: 0.9 },
  { label: 'Default', value: 1 },
  { label: 'Large', value: 1.1 },
  { label: 'XL', value: 1.25 },
];

const RADIUS_SCALE: Record<RadiusMode, number> = { sharp: 0.4, soft: 1, round: 1.6 };

export const F = {
  head: 'Figtree_600SemiBold',
  body: 'InstrumentSans_400Regular',
  bodyMed: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
};

export type T = {
  C: Palette;
  dark: boolean;
  reduceMotion: boolean;
  fs: (n: number) => number; // font size / line height
  r: (n: number) => number; // border radius (999 pills stay pills)
};

export function buildTheme(
  opts: { theme: ThemeMode; accent: AccentName; fontScale: number; radius: RadiusMode; reduceMotion: boolean },
  systemDark: boolean,
): T {
  const dark = opts.theme === 'dark' || (opts.theme === 'system' && systemDark);
  const [accent, accentDark, accentTint] = (ACCENTS[opts.accent] ?? ACCENTS.terracotta)[dark ? 'dark' : 'light'];
  const rScale = RADIUS_SCALE[opts.radius] ?? 1;
  return {
    C: { ...(dark ? DARK : LIGHT), accent, accentDark, accentTint },
    dark,
    reduceMotion: opts.reduceMotion,
    fs: (n) => Math.round(n * opts.fontScale * 2) / 2,
    r: (n) => (n >= 999 ? n : Math.round(n * rScale)),
  };
}

export function useTheme(): T {
  const { theme, accent, fontScale, radius, reduceMotion } = useStore();
  const systemDark = useColorScheme() === 'dark';
  return useMemo(
    () => buildTheme({ theme, accent, fontScale, radius, reduceMotion }, systemDark),
    [theme, accent, fontScale, radius, reduceMotion, systemDark],
  );
}

export const useC = () => useTheme().C;

// themed(sheet) → hook returning the sheet built for the current theme.
// ponytail: rebuilt per component instance via useMemo; add a WeakMap cache
// keyed on the theme object if StyleSheet churn ever shows up in profiles.
export function themed<S>(factory: (t: T) => S): () => S {
  return function useSheet() {
    const t = useTheme();
    return useMemo(() => factory(t), [t]);
  };
}
