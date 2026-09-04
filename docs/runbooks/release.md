# Release runbook

## Before a release candidate

1. `npm run typecheck && npm run lint && npm test && npm run test:emulator` —
   all green on the commit being shipped, not on a rebase of it.
2. `npm run check:config` — every variant resolves to its own identity, and a
   build that is not configured for the environment it claims fails.
3. `npm run check:android` — the generated manifest and resources actually
   contain the icons, RTL, `POST_NOTIFICATIONS` and `allowBackup="false"`.
4. `npm run export:web` succeeds. A Metro resolution failure never shows up in
   a typecheck.
5. `npm run smoke:android` against the built APK on a device.
3. Content: every seed intended for the release is published and opens in the
   staging build, including one with an image and one with every block type.
4. Walk the four states that break in production and never in review: airplane
   mode, a fresh install, 200% text, and a device where notifications are denied
   at the OS level.

## Cutting the build

```bash
eas build --profile internal-apk --platform android   # installable APK, staging
eas build --profile preview      --platform all       # staging identity
eas build --profile production   --platform all       # AAB, for the store
```

`internal-apk` is what a tester installs from a URL. `production` makes an AAB,
which does not install directly.

`runtimeVersion` follows `appVersion`, so a native or config-plugin change
requires a new binary. If you are unsure whether a change is native, it is.

## Rollout

1. Internal → TestFlight / closed track → production at 5%.
2. Hold 24 hours. Watch crash-free users, seed-open failures, and the outbox
   dead-letter count — a spike there means writes are being lost silently.
3. 25%, hold 24 hours. Then 100%.

Do not raise a rollout while an incident is open, even an unrelated one: two
variables at once makes both unreadable.

## Over-the-air updates

`eas update` is for JavaScript and assets that are compatible with the binary
already installed. Roll to 5% → 25% → 100% with the same guard as a store
release. An update that changes native behaviour is a build, not an update.

## Rollback

- **Content**: move the pointer back — `rollback` callable with the previous
  revision. Artifacts are never deleted, so this is seconds, not a restore.
- **JavaScript**: republish the previous update on the channel.
- **Binary**: halt the staged rollout, then ship a fix-forward build. A store
  rollback is slower than a hotfix in almost every case.
- **Feature**: turn the flag off. Defaults live in the binary, so a kill switch
  degrades to shipped behaviour rather than to nothing.
