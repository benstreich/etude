import { Text as RNText, type TextProps } from 'react-native';

import { F } from '@/lib/theme';

// ponytail: the design system's default face, applied once instead of on 344
// call sites. Explicit styles come after and still win, so nothing that sets
// its own fontFamily changes. Glyph characters missing from Instrument Sans
// fall back per-glyph to the OS font, which is the existing behaviour.
export const Text = ({ style, ...p }: TextProps) => <RNText style={[{ fontFamily: F.body }, style]} {...p} />;
