# Release record — 2026-09-06 · internal-apk

The first signed artifact this project has produced. **Not yet approved for
anyone outside the development team** — see the decision at the end.

## The build

| | |
|---|---|
| Commit | `5a83642a00f358e109a412b005e8b020275d9d50` |
| CI | see "Verification, before the build" — every gate run locally on this commit; the GitHub run is on PR #5 |
| EAS build id | `dd4a1956-8d13-4d0b-8c8b-892aa6121ecf` |
| EAS build URL | https://expo.dev/accounts/ghezelbash/projects/dananeh/builds/dd4a1956-8d13-4d0b-8c8b-892aa6121ecf |
| EAS project | `@ghezelbash/dananeh` · `7cf9a31c-8579-4569-a99f-211bb6f1012c` |
| Profile | `internal-apk` (APK, internal distribution, preview channel) |
| Build number | `1` (versionCode) |
| App version | `1.0.0` |
| Runtime version | `1.0.0` · fingerprint `9f5859312712ce25ee5f22d0d1988f7e6d4e41be` |
| Built at | 2026-09-06 00:43:01 → 01:04:16 (+02:00), 21m 15s |
| Artifact URL | https://expo.dev/artifacts/eas/snEM1NNMg97bB__OnJ7C5SB7StxSTmZU6ZwmsUyY-B4.apk |
| APK SHA-256 | `f6423a8af27bb3c68a8f36f39a7fd770d6d7fa0479468ded560b3f183b0336fa` |
| APK size | 116.4 MB |
| Package | `com.dananeh.app.staging` |
| Backend project | `dananeh-staging` |
| Content source | `remote` |

## Signing

| | |
|---|---|
| Keystore | EAS-managed — `Build Credentials wQTvDrReSW (default)` |
| Scheme | APK Signing Block present, **v2** (`0x7109871a`) |
| Backed up | **Not yet.** `eas credentials --platform android` → download. Owner action |

The same key must sign every build of `com.dananeh.app.staging`: a device
refuses an update signed by a different one.

## Verification, before the build

Run under Node 22.23.2 — the runtime Cloud Functions provisions — after a clean
`npm ci`.

| check | command | result |
|---|---|---|
| Types, lint | `npm run typecheck && npm run lint` | pass |
| Unit | `npm test -- --ci --detectOpenHandles` | 26 suites, 376 tests, no open handles |
| Rules and integration | `npm run test:emulator` | 23 suites, 338 tests |
| Config per variant | `npm run check:config` | pass, including the `internal-apk` profile shape |
| Event coverage | `npm run check:events` | 16 events, all wired |
| Flow validity | `npm run check:e2e` | pass |
| Native manifest | `npm run check:android` | 11/11, from a clean prebuild |
| Node matches the runtime | `npm run check:node` | Node 22 |
| Environment | `APP_VARIANT=staging npm run verify:env` | 14/14 |
| Legal and support endpoints | `npm run check:legal` | **FAILS** — neither URL resolves |

```
$ APP_VARIANT=staging npm run verify:env

  variant                staging
  configuration          .env.staging
  app name               Dananeh (Staging)
  android package        com.dananeh.app.staging
  scheme                 dananeh-staging
  firebase project       dananeh-staging
  storage bucket         dananeh-staging.firebasestorage.app
  functions region       europe-west1
  api key                AIza…5HEc (39 chars)

  ✓ nothing resolves to the pre-rebrand project
  ✓ not addressing the emulator suite
  ✓ serving published content rather than the seeds in the binary
  ✓ not a demo project
  ✓ the configuration says staging and the build is staging
  ✓ client and functions agree on europe-west1
  ✓ the package is com.dananeh.app.staging
  ✓ anonymous sign-in is enabled
  ✓ and the account it created was removed again
  ✓ email/password sign-in is enabled
  ✓ Firestore answers (200)
  ✓ Storage answers (403)
  ✓ ingestProgress is deployed in europe-west1 (401)
  ✓ and refuses an unauthenticated call

Environment verified.
```

## What is inside the artifact

Checked by unpacking the APK, not inferred from the config:

| | |
|---|---|
| Package, from the compiled manifest | `com.dananeh.app.staging` |
| Deep-link scheme | `dananeh-staging` |
| Firebase config baked into the JS bundle | `dananeh-staging.firebaseapp.com`, `dananeh-staging.firebasestorage.app`, sender `1066103901472` |
| The retired project's API key | **absent** |
| `demo-dananeh` | absent |
| `wisdom-wafers` | **present as a string** — see below |

The literal `wisdom-wafers` does appear in the bundle. It is the
`RETIRED_PROJECT_IDS` denylist from `config/env.js`, which ships because
`src/platform/env.ts` is imported at runtime — the guard's other strings
(`retired-project`, `pre-rebrand`, `emulator-in-release`) are present alongside
it. It is a constant the build refuses to *match*, not a backend it points at,
and it is not user-visible. Recorded rather than glossed over.

`127.0.0.1` matches only as a splice of two unrelated literals in Metro's
string table (`draft-2020-12` + `7.0.0.1`). `http://localhost:8081` is a real
literal from a third-party dependency, not from this app's configuration.

## Verification, after the build

| check | how | result |
|---|---|---|
| Installs on a clean device with no Metro, no USB, no dev server | from the artifact URL | **not done** |
| Cold start reaches Home | force-stop, launch ×3 | **not done** |
| One splash, no second mismatched screen | recording, light and dark | **not done** |
| End-to-end suite | `npm run smoke:android` | **not done** |
| Backend round trip | `npm run diagnose` against staging | pass (from a workstation, not the APK) |
| Internal-beta checklist | `docs/internal-beta.md` | **not done** |

Everything marked "not done" needs an Android device or emulator. There is no
Android SDK in the environment this build was produced in — neither `adb` nor
`maestro` — so none of it has been executed, and none of it is assumed.

## Devices

| device | Android | result |
|---|---|---|
| — | — | nothing has been installed |

## Known issues

| issue | severity | affects | workaround |
|---|---|---|---|
| Privacy policy and terms do not resolve | **P0 for external release** | `https://dananeh.app/privacy`, `/terms` — both linked from the About screen | Publish the pages. `npm run check:legal` gates this |
| Maestro suite never executed | **P0 for sign-off** | all eleven flows | Needs a device |
| `expo-updates` absent while every profile sets `channel: preview` | P2 | EAS warns on each build; OTA is deliberately off | Remove `channel`, or install `expo-updates`. Not touched during a release |
| Android launcher name is Latin | P2 | reads "Dananeh (Staging)", not «دانانه» | `app_name` in a Persian values folder — a product decision |
| English port reads "1 seeds" | P3 | LTR only | `count` is a display string at 27 call sites |
| App Check registered but not enforced | P2 | abuse protection is rules + rate limits | The JS SDK cannot attest on Android; needs RNFirebase |

## Decision

- **Go / No-Go: No-Go for anyone outside the development team.**
- **Go for on-device verification by the development team** — that is the next
  step, and the artifact exists for it.
- **Decided by:** pending owner sign-off.
- **Rationale:** the binary is signed, points only at `dananeh-staging`, and
  every backend path it needs answers correctly from a workstation. What is
  missing is that nobody has run it on a phone, and the two legal endpoints it
  links to do not exist. Neither is a code problem; both are blocking.
- **Rollback:** there is no previous artifact — this is the first. Content rolls
  back with `rollback` (a pointer move; artifacts are never deleted) and
  features with `appConfig/public`, neither needing a new build.
