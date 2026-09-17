// The app's three touches, web-safe. `tap` for picking something (a day, a star,
// a stage), `thud` for a beat you should feel (a note sounding, a sheet let go),
// `success` for something saved. Quiet failures: haptics are never worth a crash.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS !== 'web';

export const tap = () => {
  if (on) Haptics.selectionAsync().catch(() => {});
};
export const thud = (light = false) => {
  if (on) Haptics.impactAsync(light ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
export const success = () => {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};
