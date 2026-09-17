// Coverage gate. Every exported function in src/lib is either exercised by a
// check script or listed below with a reason — nothing untested lands quietly.
//
// Constants are not gated: asserting `MIN_BPM === 20` restates the source.
// Only functions are, because only functions can be wrong.
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Modules that cannot run under `node --experimental-strip-types`: they load
// react-native or a native Expo module at import time. The project's answer is
// to keep the logic in a sibling (-math.ts, reminder-time.ts) and leave a thin
// I/O shell here. A name below is a promise that the shell holds no logic.
const EXEMPT: Record<string, string> = {
  'app-icon.ts': 'applyAccentIcon is an expo-alternate-app-icons call; iconNameFor is covered by check-icon',
  'attachments.ts': 'expo-document-picker I/O; the logic is in attachment-math.ts',
  'audio-mode.ts': 'expo-audio session flags, no branching of our own',
  'backup.ts': 'file pickers and writes; the logic is in backup-math.ts',
  'doc-path.ts': 'reads Paths.document from expo-file-system at call time',
  'haptics.ts': 'three expo-haptics calls',
  'i18n.ts': 'reads the device locale from expo-localization at module load',
  'import-recording.ts': 'document picker + file copy',
  'melody-play.ts': 'React hook over expo-audio players',
  'metronome.tsx': 'React context over the native click engine; the logic is in metronome-math.ts',
  'piano-samples.ts': 'static require() map of bundled assets',
  'plan-run-state.ts': 'a module-level variable and a useSyncExternalStore subscription',
  'reminders.ts': 'expo-notifications scheduling; the parsing is in reminder-time.ts',
  'review.ts': 'expo-store-review call; the logic is in review-math.ts',
  'sounds.ts': 'expo-audio playback',
  'store.tsx': 'React context over AsyncStorage; the logic lives in the -math modules',
  'theme.ts': 'React hooks over useColorScheme',
  'tuner-input.ts': 'mic permissions and lifecycle; the logic is in tuner-math.ts',
};

const checks = readdirSync('scripts')
  .filter((f) => f.startsWith('check-') && f !== 'check-coverage.ts')
  .map((f) => readFileSync(join('scripts', f), 'utf8'))
  .join('\n');
const mentioned = (name: string) => new RegExp(`[^A-Za-z0-9_$]${name}[^A-Za-z0-9_$]`).test(checks);

const untested: string[] = [];
const modules = readdirSync('src/lib').filter((f) => /\.tsx?$/.test(f));
for (const file of modules) {
  if (file in EXEMPT) continue;
  const src = readFileSync(join('src/lib', file), 'utf8');
  // exported function declarations, and exported consts bound to an arrow
  const names = [...src.matchAll(/^export (?:async function|function) (\w+)|^export const (\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(/gm)].map((m) => m[1] ?? m[2]);
  for (const n of names) if (!mentioned(n)) untested.push(`${file}: ${n}`);
}

assert.deepEqual(untested, [], `exported functions no check script touches:\n  ${untested.join('\n  ')}\nAdd a check, or exempt the module in scripts/check-coverage.ts with a reason.`);

// an exemption for a module that no longer exists is a stale promise
const stale = Object.keys(EXEMPT).filter((f) => !modules.includes(f));
assert.deepEqual(stale, [], `EXEMPT lists modules that are gone: ${stale.join(', ')}`);

console.log(`check-coverage ok — ${modules.length - Object.keys(EXEMPT).length} modules gated, ${Object.keys(EXEMPT).length} exempt`);
