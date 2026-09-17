// The launcher icon follows the accent (#80). iconNameFor() hands a name to
// expo-alternate-app-icons, which fails silently on a name the config plugin
// never registered — so the code and app.json have to agree here, not at runtime.
import assert from 'node:assert';

import app from '../app.json' with { type: 'json' };
import { iconNameFor } from '../src/lib/app-icon.ts';

const ACCENTS = ['terracotta', 'forest', 'indigo', 'ocean', 'plum', 'slate'] as const;

// the default icon is the bare one — switching to it takes null, not a name
assert.equal(iconNameFor('terracotta'), null);
for (const a of ACCENTS.filter((a) => a !== 'terracotta'))
  assert.equal(iconNameFor(a), a.charAt(0).toUpperCase() + a.slice(1), `${a} → capitalised name`);

const plugin = (app.expo.plugins as unknown[]).find(
  (p): p is [string, { name: string }[]] => Array.isArray(p) && p[0] === 'expo-alternate-app-icons'
);
assert.ok(plugin, 'expo-alternate-app-icons must be configured in app.json');
const declared = new Set(plugin[1].map((i) => i.name));
for (const a of ACCENTS) {
  const name = iconNameFor(a);
  if (name) assert.ok(declared.has(name), `app.json declares no icon named "${name}" for accent ${a}`);
}
assert.equal(declared.size, ACCENTS.length - 1, 'app.json declares an icon no accent uses');

console.log('check-icon ok');
