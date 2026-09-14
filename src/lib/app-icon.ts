// The launcher icon follows the accent (#80). expo-alternate-app-icons needs a
// native build; in Expo Go its requireNativeModule throws on load, so it is
// required lazily and every failure is swallowed — the icon is cosmetic.
import type { AccentName } from './theme';

type IconModule = {
  supportsAlternateIcons: boolean;
  getAppIconName: () => string | null;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
};

let mod: IconModule | null | undefined;
const load = (): IconModule | null => {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-alternate-app-icons') as IconModule;
  } catch {
    mod = null;
  }
  return mod;
};

/** Alternate icon name for an accent; the default (terracotta) icon is `null`. Must match app.json. */
export const iconNameFor = (accent: AccentName): string | null =>
  accent === 'terracotta' ? null : accent.charAt(0).toUpperCase() + accent.slice(1);

/** Switch the launcher icon to the accent's colour, only when it differs — on some Android launchers a switch closes the app for a moment. */
export async function applyAccentIcon(accent: AccentName) {
  const m = load();
  if (!m?.supportsAlternateIcons) return;
  const want = iconNameFor(accent);
  try {
    if (m.getAppIconName() !== want) await m.setAlternateAppIcon(want);
  } catch {
    // unsupported launcher or a mid-switch race — nothing the user can act on
  }
}
