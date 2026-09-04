# 16. A misconfigured environment fails the build

Date: 2026-09-04 · Status: accepted · Extends ADR 8

## Context

ADR 8 gave each variant its own identity so all three can sit on one device.
What it did not give them was any guarantee that a variant's *backend* matches.

`.env` named a project that did not correspond to any alias in `.firebaserc`.
A live probe returned `API key not valid` from Auth and HTTP 403 from Firestore.
The app did exactly what it was designed to do with an unreachable backend: it
fell back to a device-local identity and carried on. Nothing crashed, nothing
was logged where anyone would see it, and sign-in simply "did not work".

That fallback is right for development, where working with no backend is the
point. It is wrong for a binary handed to a tester, because it converts a
misconfiguration into a mystery.

Separately, `eas.json` set only `APP_VARIANT` and `EXPO_PUBLIC_CONTENT_SOURCE`,
so an EAS build did not necessarily receive Firebase configuration at all.

## Decision

**A staging or production build that is not configured for its environment is a
build failure, not a degraded mode.**

The rules live in `config/env.js`, in plain CommonJS. `app.config.ts` is
transpiled on its own by the Expo config loader — its imports are not — so a
TypeScript module there fails to resolve at build time. `src/platform/env.ts` is
the typed façade the app uses. One implementation, two callers:

- **build time**: `app.config.ts` calls `assertEnvironment`, so the build stops
  before Metro starts, with the full list of what is wrong;
- **startup**: in a *shipped* binary only, the root layout replaces the app with
  `MisconfiguredEnvironment`, which names the variables. Unlocalised and
  technical on purpose — the only person who can see it is whoever assembled
  the binary.

**The cross-check is build-time only, and that is a correction.** It first ran
at startup as well, re-deriving the variant from `Constants.expoConfig.extra`.
That is empty at runtime on web, so `appVariant()` fell back to `production`,
disagreed with `EXPO_PUBLIC_ENV_NAME=development`, and replaced every dev server
with the misconfiguration screen — `npm run web` showed nothing else.

The mistake underneath it: `APP_VARIANT` is not an `EXPO_PUBLIC_` variable, so
it never reaches the bundle. The runtime check was comparing against a value it
cannot see. A check whose failure mode is "replace the whole app" must not
depend on something that can simply be absent.

So the runtime check now asks only what it can actually answer — is the Firebase
configuration baked into this bundle complete, and is it not a demo project —
and it does not run under `__DEV__` at all. `appVariant()` reads
`EXPO_PUBLIC_ENV_NAME`, which Expo inlines at build time and which is therefore
always present if it was present when the build was made.

`EXPO_PUBLIC_ENV_NAME` must equal `APP_VARIANT`. This is the check that stops a
staging build carrying production's Firebase project. It is a separate variable
rather than something derived from the project id because project ids are named
by whoever created them and cannot be relied on to say which is which — whoever
fills in the EAS environment states it, and the build compares.

All problems are reported at once. Someone filling in a dashboard should see the
whole list, not discover them one build at a time.

## Consequences

- `eas.json` gains `internal-apk` (Android APK, staging backend, internal
  distribution) and a shared `base` profile; every profile now sets
  `EXPO_PUBLIC_ENV_NAME`, and each names an EAS `environment`.
- `npm run check:config` evaluates the real config for each variant and asserts
  both halves: the identity is right, and six named misconfigurations fail. It
  is a CI gate.
- CI also prebuilds and `assembleDebug`s Android. A config-plugin or native
  dependency change typechecks fine and then fails on a device; this is the
  cheapest gate that catches it without EAS credentials.
- `.env.example` is committed and `.env` is not — asserted by the secret scan.
- Development is deliberately exempt from all of it.
