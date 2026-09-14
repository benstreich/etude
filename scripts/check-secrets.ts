// Secret scan for the public repo (#63). Run: npm run check:secrets
//
// ponytail: gitleaks when it is installed, a filename + key-header scan when it
// is not. The fallback is deliberately dumb — it catches the things that would
// actually end this project (a keystore, a service account, a private key, an
// .env) and nothing else. It is not a replacement for GitHub's push protection,
// which is the real net; this one just fails fast on your own machine.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

// Files that must never be tracked, whatever they contain.
const FORBIDDEN = [
  /(^|\/)\.env($|\.)(?!example)/i,
  /\.(jks|keystore|p8|p12|pem|key|mobileprovision)$/i,
  /(^|\/)(credentials|google-services)\.json$/i,
  /(^|\/)GoogleService-Info\.plist$/i,
];

// Contents that mean a key ended up inside a file that is otherwise fine.
const PATTERNS: [string, RegExp][] = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Google service account', /"type"\s*:\s*"service_account"/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{36}\b/],
  ['Expo access token', /\bDsT_[0-9A-Za-z_-]{20,}\b/],
];

// Text only — a false positive inside a 200KB wav helps nobody.
const SKIP = /\.(wav|png|jpg|jpeg|gif|webp|mp4|m4a|ttf|otf|ico|keystore|jks)$/i;

function gitleaks(): boolean {
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim();
  const args = staged
    ? ['protect', '--staged', '--redact', '--no-banner']
    : ['detect', '--redact', '--no-banner'];
  const run = spawnSync('gitleaks', args, { stdio: 'inherit' });
  if (run.error) return false; // not installed — fall through to the built-in scan
  if (run.status !== 0) process.exit(1);
  console.log(`secrets ok — gitleaks ${staged ? 'protect --staged' : 'detect'}`);
  return true;
}

if (!gitleaks()) {
  const files = tracked();
  const findings: string[] = [];

  for (const file of files) {
    if (FORBIDDEN.some((rule) => rule.test(file))) findings.push(`${file}: this file must never be tracked`);
    if (SKIP.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable or binary; the filename rules already had their say
    }
    // the patterns above appear in this file as source — don't report ourselves
    if (file === 'scripts/check-secrets.ts') continue;
    for (const [name, pattern] of PATTERNS) {
      if (pattern.test(text)) findings.push(`${file}: looks like a ${name}`);
    }
  }

  if (findings.length) {
    console.error('secrets FOUND — do not commit, and treat any key here as burned:');
    for (const f of findings) console.error(`  ${f}`);
    console.error('\nRotation runbook: docs/release.md');
    process.exit(1);
  }
  console.log(`secrets ok — ${files.length} tracked files, built-in scan`);
  console.log('  (install gitleaks for the real thing: https://github.com/gitleaks/gitleaks)');
}
