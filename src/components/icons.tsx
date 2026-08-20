// Icon paths copied from design/Instrument Progress.dc.html (1.8 stroke, round caps)
import React from 'react';
import { ColorValue, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useC } from '@/lib/theme';

type P = { color?: ColorValue; size?: number };

export const HomeIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
  );
};

export const ClockIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.8} />
    <Path d="M12 7.5V12l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
  );
};

export const SearchIcon = ({ color: colorProp, size = 18 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.8} />
    <Path d="m16 16 4.5 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
  );
};

export const BarsIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 20V13M10 20V8M16 20v-9M22 20V4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
  );
};

export const NoteIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 18V5.5L20 3v12.5" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    <Circle cx={6.5} cy={18} r={2.5} stroke={color} strokeWidth={1.8} />
    <Circle cx={17.5} cy={15.5} r={2.5} stroke={color} strokeWidth={1.8} />
  </Svg>
  );
};

export const PersonIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={1.8} />
    <Path d="M4.5 20.5c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
  );
};

// Material Design "settings" glyph, inlined (Apache 2.0) — filled, so no stroke
export const GearIcon = ({ color: colorProp, size = 22 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      fill={color}
    />
  </Svg>
  );
};

export const PlayIcon = ({ color: colorProp, size = 16 }: P) => {
  const C = useC();
  const color = colorProp ?? C.bg;
  return (
    <Svg width={(size * 14) / 16} height={size} viewBox="0 0 14 16">
      <Path d="M1 1.8v12.4c0 .7.8 1.1 1.4.8l10-6.2c.6-.4.6-1.2 0-1.6L2.4 1C1.8.6 1 1.1 1 1.8Z" fill={color} />
    </Svg>
  );
};

export const FlameIcon = ({ color: colorProp, size = 14 }: P) => {
  const C = useC();
  const color = colorProp ?? C.accent;
  return (
  <Svg width={(size * 12) / 14} height={size} viewBox="0 0 12 14" fill="none">
    <Path d="M6 1C6 4 2 5.5 2 9a4 4 0 0 0 8 0c0-1.4-.6-2.4-1.3-3.4C7.8 7 6.8 7.6 6.8 7.6 7.4 5 6 1 6 1Z" fill={color} />
  </Svg>
  );
};

export const LockIcon = ({ color: colorProp, size = 14 }: P) => {
  const C = useC();
  const color = colorProp ?? C.sub;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 10.5V8a6 6 0 0 1 12 0v2.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Path d="M5 10.5h14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
  );
};

export const ChevronIcon = ({ color: colorProp, size = 12 }: P) => {
  const C = useC();
  const color = colorProp ?? C.faint;
  return (
  <Svg width={(size * 7) / 12} height={size} viewBox="0 0 8 14">
    <Path d="M1 1l6 6-6 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
  );
};

// Fermata logomark in its rounded square
export const LogoMark = ({ size = 26 }: { size?: number }) => {
  const C = useC();
  return (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.27,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
    <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 40 40">
      <Path d="M6 26c0-9.5 6.3-17 14-17s14 7.5 14 17" fill="none" stroke="#FAF7F2" strokeWidth={3.4} strokeLinecap="round" />
      <Circle cx={20} cy={27} r={3.4} fill={C.logoDot} />
    </Svg>
  </View>
  );
};
