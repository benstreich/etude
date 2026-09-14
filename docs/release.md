# Releasing, and where the credentials live

The source is public on purpose. Nothing that lets someone ship as Étude or
spend our money is in it, and this page is the record of where those things
actually are — plus what to do the day one of them leaks.

## Nothing sensitive is tracked

Checked against `git ls-files`: no keystore, no `.p8`/`.p12`, no `.env`, no
`google-services.json`, no `credentials.json`. `.gitignore` covers all of them,
and `npm run check:secrets` fails the build if one appears:

```bash
npm run check:secrets     # gitleaks when installed, a filename + key-header scan otherwise
```

Install [gitleaks](https://github.com/gitleaks/gitleaks) for the real scan
(`brew install gitleaks`, `winget install gitleaks`). It is optional — the
built-in fallback catches keystores, service accounts, private-key blocks and
stray `.env` files, which are the ones that would end this project. Wire it to
a hook if you want it automatic:

```bash
printf '#!/bin/sh\nnpm run --silent check:secrets\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

GitHub secret scanning with push protection is the real net, and it is free on
public repos: **Settings → Code security → Secret protection**.

## What is public, and fine

`app.json` (bundle id `com.benstreich.etude`, package name, EAS `projectId`,
`owner`), `eas.json` build profiles, the privacy policy, the docs, the generated
audio. The store listing exposes the first two anyway, and a project id is an
identifier, not a credential. Nobody needs to panic about these.

## Where the credentials actually are

| Thing | Lives | Reached by |
|---|---|---|
| Android release keystore | EAS servers (Expo-managed) | `npx eas-cli credentials` → Android |
| Apple distribution cert + provisioning profile | EAS servers | `npx eas-cli credentials` → iOS |
| Google Play service account (for `eas submit`) | Play Console → API access; the JSON downloads to a gitignored path only | Play Console |
| Play Console / App Store Connect access | The owner account, 2FA on | benstreich |
| EAS account | `benstreich`, team `benstreichs-team` | expo.dev |

A local `credentials.json` is only ever a temporary thing on one machine. It is
gitignored; if you need it, it stays in the working tree and never in a commit.

## Cutting a release

```bash
npx expo-doctor
npm run check && npm run check:i18n && npm run check:secrets
npx eas-cli build --profile preview      # installable APK
npx eas-cli build --profile production   # store bundle (.aab)
```

Bump `android.versionCode` in `app.json` before a production build — EAS
auto-increments on its side and the two drift otherwise. JS-only changes ship
without a build: `npx eas-cli update --channel production`.

Play Console status and the 14-day closed-testing requirement are tracked in
`docs/2026-09-13-play-store-deploy.md`.

## If something leaks

Treat the key as burned. Rotating is cheap; hoping is not. A force-push does
**not** clean it up — forks, clones, CI caches and GitHub's own views keep the
old history, so the only fix is to make the leaked credential worthless:

1. **Android keystore** — `npx eas-cli credentials`, remove the compromised
   keystore and generate a new one. If it was the *upload* key, request an
   upload-key reset in Play Console (Setup → App integrity); Google re-signs
   with the app signing key, so users are unaffected. If the app *signing* key
   leaked and Play App Signing is not enabled, the app id is finished — a new
   package name and a migration are the only way out.
2. **Apple certificate** — revoke it in the Apple Developer portal, then let
   EAS issue a fresh one. Existing App Store builds keep working.
3. **Google service account** — delete the key in the Cloud console, issue a
   new one, update the EAS submit profile.
4. **Any token** (Expo, GitHub) — revoke first, recreate second.
5. Then, and only then, clean the history if you like — but the rotation is
   what made it safe, not the rewrite.
