// i18n-js over two JSON dictionaries; English is the fallback for missing keys.
// React code gets `t`/`lang` from the store (so language changes re-render);
// non-React code (reminders) reads the singleton, kept in sync by StoreProvider.
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import de from '../locales/de.json';
import en from '../locales/en.json';

export type Lang = 'en' | 'de';
export type LanguageSetting = 'system' | Lang;

export const i18n = new I18n({ en, de });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// ponytail: device language read once at module load — OS language changes
// apply on next app start (iOS restarts the app on change anyway)
const deviceLang: Lang = getLocales()[0]?.languageCode === 'de' ? 'de' : 'en';

export const resolveLang = (setting: LanguageSetting): Lang => (setting === 'system' ? deviceLang : setting);

/** Translate outside React (notifications etc.) — uses the synced singleton locale. */
export const tr = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);
