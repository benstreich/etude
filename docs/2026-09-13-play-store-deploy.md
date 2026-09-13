# Play Store deployment — status as of 2026-09-13

## Done
- Google Play developer account created (Ben).
- Working tree cleaned up and committed (`73ba330` — audio identity cues,
  tempo module, Newsreader/Space Grotesk font swap). All `npm run check`
  scripts pass.
- Privacy policy written (`docs/privacy-policy.md`) and hosted publicly
  since Sydoc-IT's Claude workspace policy blocks "anyone with the link"
  artifact sharing:
  https://gist.github.com/benstreich/838abedca283b1381b521958ddd46007
- Production Android build cut via EAS:
  - `.aab`: https://expo.dev/artifacts/eas/Yfo0QCa5OAAlwvuWlMtM4KN-t9RIWla_v5sT7kHMqYU.aab
  - Build logs: https://expo.dev/accounts/benstreichs-team/projects/etude/builds/899502c8-f99c-4e26-a3a6-1eb128126072
  - EAS bumped `versionCode` to 3 for this build. **`app.json` still says
    `versionCode: 2`** — bump it locally before the next build so it
    doesn't drift from what EAS has already used.

## In progress (Ben, on Google's side)
- Play Console identity verification (ID check) — submitted, waiting.
- Play Console bank/payments verification — submitted, waiting.
Both are prerequisites Google gates publishing on; no action on our side
until they clear.

## Left to do once verification clears
1. Create the app in Play Console (name, default language, free/paid).
2. Testing → Closed testing → new track → upload the `.aab` above.
3. Add 12+ testers (emails or a Google Group) and keep the track running
   **14 continuous days** before Google allows a production release — this
   is the real bottleneck, start it as soon as verification clears.
4. App content → Data safety: answer "no data collected" everywhere —
   the app has no backend, no accounts, no analytics.
5. App content → Privacy policy: paste the gist URL above.
6. App content → Content rating questionnaire.
7. Main store listing: short + full description, ≥2 phone screenshots,
   1024×500 feature graphic. Icon already exists at
   `assets/images/icon.png`. Claude can draft description copy and take
   screenshots on request — not started yet.
8. Permissions declaration: `RECORD_AUDIO` will likely get flagged in
   review — justify it as practice-session recording.
9. After 14-day closed test completes: submit for production review
   (Google's review is typically 1-3 days after that).

## Notes
- `eas-cli` isn't a local devDependency; run it via `npx eas-cli ...`.
- EAS account: `benstreich`, owner of team `benstreichs-team` (matches
  `app.json`'s `owner` field).
