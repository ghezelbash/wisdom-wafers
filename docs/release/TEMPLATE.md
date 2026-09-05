# Release record — <date> · <profile>

> Copy to `docs/release/<YYYY-MM-DD>-<profile>.md` and fill in. Every row is
> required. "Unknown" is an answer; blank is not.

## The build

| | |
|---|---|
| Commit | `<sha>` — the exact commit built, not the branch |
| CI | green on that commit: `<workflow run url>` |
| EAS build id | `<id>` |
| EAS build URL | `<url>` |
| Profile | `internal-apk` |
| Build number | `<versionCode>` |
| App version | `<x.y.z>` |
| Built at | `<iso timestamp>` |
| Artifact URL | `<url>` |
| APK SHA-256 | `<shasum -a 256 dananeh.apk>` |
| Package | `com.dananeh.app.staging` |
| Backend project | `dananeh-staging` |
| Content source | `remote` |

## Verification, before the build

| check | command | result |
|---|---|---|
| Types, lint | `npm run typecheck && npm run lint` | |
| Unit | `npm test -- --ci` | |
| Rules and integration | `npm run test:emulator` | |
| Config per variant | `npm run check:config` | |
| Event coverage | `npm run check:events` | |
| Flow validity | `npm run check:e2e` | |
| Native manifest | `npm run check:android` | |
| Environment | `APP_VARIANT=staging npm run verify:env` | |

Paste the `verify:env` output here — it is identity only, no secrets.

```
<verify:env output>
```

## Verification, after the build

| check | how | result |
|---|---|---|
| Installs on a clean device with no Metro, no USB, no dev server | from the artifact URL | |
| Cold start reaches Home | force-stop, launch ×3 | |
| One splash, no second mismatched screen | recording, light and dark | |
| End-to-end suite | `npm run smoke:android` | |
| Backend round trip | `npm run diagnose` against staging | |
| Internal-beta checklist | `docs/internal-beta.md` | |

## Devices

| device | Android | result |
|---|---|---|
| | | |

## Known issues

| issue | severity | affects | workaround |
|---|---|---|---|

## Decision

- **Go / No-Go:** 
- **Decided by:** 
- **Rollback:** the previous artifact is `<url>`; content rolls back with
  `rollback` (pointer move, artifacts are never deleted) and features with
  `appConfig/public`. State which applies.
