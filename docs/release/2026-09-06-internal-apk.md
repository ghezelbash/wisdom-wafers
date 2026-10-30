# Release record — 2026-09-06 · internal-apk

The first signed artifact this project has produced.

> **`dd4a1956` is superseded — do not install it.** It opened to the logo screen
> and stayed there. The replacement is `c9125fa5`, below. This record keeps the
> failure because it is the most useful thing in it.

## The artifact to install

| | |
|---|---|
| EAS build id | `c9125fa5-5e79-4542-9244-eb16eca01909` |
| Install / QR | https://expo.dev/accounts/ghezelbash/projects/dananeh/builds/c9125fa5-5e79-4542-9244-eb16eca01909 |
| Commit | `8eee35fe136cbb9c443308d33a108d2efe4422f1` |
| Artifact URL | https://expo.dev/artifacts/eas/CH3h2QoL13Z9nrNSHnf-B-SCuE2iUuVix5NswDjp9II.apk |
| APK SHA-256 | `9bafe6d8005455d0874a9f771106c2b9b1d2eb63a3613f184586190da9c55ac3` |
| Size | 116.4 MB · versionCode 1 · v1.0.0 |
| Built at | 2026-09-06 01:37:23 → 01:54:32 (+02:00), 17m 09s |
| Signed | APK Signing Block present, same EAS-managed keystore |

Verified by unpacking the artifact rather than trusting the build: the runtime
check now carries `EXPO_PUBLIC_CONTENT_SOURCE`, the splash watchdog is in the
bundle, the backend is `dananeh-staging`, and the four Yekan Bakh faces are
present.

**Still unverified on a device.** Whether it starts is the first thing to find
out, and nobody has yet.

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
| **Artifact does not start** | **P0 — fixed** | `dd4a1956` only | Superseded; see above |
| Maestro suite never executed | **P0 for sign-off** | all eleven flows | Needs a device |
| `expo-updates` absent while every profile sets `channel: preview` | P2 | EAS warns on each build; OTA is deliberately off | Remove `channel`, or install `expo-updates`. Not touched during a release |
| Android launcher name is Latin | P2 | reads "Dananeh (Staging)", not «دانانه» | `app_name` in a Persian values folder — a product decision |
| English port reads "1 seeds" | P3 | LTR only | `count` is a display string at 27 call sites |
| App Check registered but not enforced | P2 | abuse protection is rules + rate limits | The JS SDK cannot attest on Android; needs RNFirebase |

## Post-build defect — the artifact does not start

Installed on a physical Android device, `dd4a1956` shows the native splash and
never proceeds. Nothing else happens: no error, no screen, no crash.

**Two defects, both introduced during this session's own work.**

### 1 · A correct build declaring itself misconfigured

Goal 11 added `EXPO_PUBLIC_CONTENT_SOURCE` to `validateEnvironment`, which is
shared between the build and the device — and only the build-time callers were
updated. `currentEnvironmentIssues` supplies six Firebase keys and the
environment name, so on a device the content source read as absent:

```
$ node -e "…validateEnvironment({ variant:'staging', env: <the six keys + env name> })"
issues on a correctly configured staging APK: 1
  EXPO_PUBLIC_CONTENT_SOURCE — missing
```

`RootLayout` then renders `MisconfiguredEnvironment` instead of the app.

### 2 · The reason nothing said so

`SplashScreen.hideAsync()` was reachable from exactly one component — the splash
overlay, nested inside four providers — and four `return`s sit above it. The
misconfiguration branch mounts none of those providers, so the screen written to
*explain* the problem was drawing behind a splash nobody had told to go away.

The same shape applies to three other paths: a font that fails to load, a locale
bootstrap that never settles, and a config fetch that never resolves. Each ends
on the logo for the life of the process.

### How it was diagnosed without a device

The backend had already recorded the answer. Every reader is signed in
anonymously before the first screen, and staging held **only the three staff
accounts** — no anonymous user was ever created — with zero crash reports and
zero telemetry. Startup never reached `AuthProvider`.

### Why the pipeline was green throughout

Nothing in it exercises this. `currentEnvironmentIssues` returns `[]` under
`__DEV__`, so the check does not run in dev, on web, or in any unit test; and
the native CI job builds `assembleDebug`, which is a debug build. The first time
the code path ran anywhere was on the phone.

### Fixed in `8eee35f`

- The runtime check supplies the content source, and `env.test.ts` now asserts
  that **every key the validator can reject is one the device-side check
  passes** — a rule added without a matching input now fails a unit test.
- One `hideSplash` helper, called on the misconfiguration path and from an
  8-second watchdog, so no path can end on the logo.
- A font that fails to load no longer hangs startup; Persian falls back to the
  system face.
- `release-disclosures.test.ts` asserts all three statically.

## Decision

- **Go / No-Go: No-Go — this artifact does not start.** Superseded by the build
  from `8eee35f`.
- The on-device verification it was built for found exactly the defect it was
  built to find, on the first launch. That is the process working, not failing.
- **Decided by:** pending owner sign-off.
- **Rationale:** the binary is signed, points only at `dananeh-staging`, and
  every backend path it needs answers correctly from a workstation. What is
  missing is that nobody has run it on a phone, and the two legal endpoints it
  links to do not exist. Neither is a code problem; both are blocking.
- **Rollback:** there is no previous artifact — this is the first. Content rolls
  back with `rollback` (a pointer move; artifacts are never deleted) and
  features with `appConfig/public`, neither needing a new build.
