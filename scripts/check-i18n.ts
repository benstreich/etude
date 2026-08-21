// Fails if en/de dictionaries drift apart, or code uses a key neither defines.
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import de from '../src/locales/de.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };

const flat = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !('one' in v && 'other' in v) ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

const enKeys = new Set(flat(en));
const deKeys = new Set(flat(de));
const missingDe = [...enKeys].filter((k) => !deKeys.has(k));
const extraDe = [...deKeys].filter((k) => !enKeys.has(k));
assert.deepEqual(missingDe, [], `keys missing in de.json: ${missingDe.join(', ')}`);
assert.deepEqual(extraDe, [], `keys in de.json but not en.json: ${extraDe.join(', ')}`);

// every static t('...')/tr('...') key in src must exist (dynamic keys are skipped)
const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk(join(import.meta.dirname, '../src'));

const used = new Set<string>();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:t|tr)\(\s*'([a-zA-Z0-9.]+)'/g)) used.add(m[1]);
}
const undefined_ = [...used].filter((k) => k.includes('.') && !enKeys.has(k));
assert.deepEqual(undefined_, [], `t() keys not in en.json: ${undefined_.join(', ')}`);

console.log(`i18n ok — ${enKeys.size} keys, ${used.size} static usages checked`);
