# 25. A clean staging environment, and a build that refuses to be vague

Date: 2026-09-05

## Status

Accepted. The code side is done; the provisioning is owner action.

## Context

`.env` in this checkout points at **`wisdom-wafers`**, the project this app was
before the rebrand. Running the new verifier against it says what is actually
there:

```
✗ anonymous sign-in is enabled
✗ email/password sign-in is enabled
✗ Firestore answers (403)
✗ Storage answers (404)
✗ ingestProgress is deployed in europe-west1 (404)
```

Neither sign-in method is on, Firestore refuses, the bucket does not exist, and
no function is deployed. That is the entire explanation for "I still cannot make
an account or log in". Nothing in the app was broken; it was pointed at a
project that answers a handshake and nothing else.

Worse, a build could reach that state and look fine. Three separate holes:

1. **The emulator flag exempted every variant.** `validateEnvironment` returned
   early on `usingEmulator`, so a *staging* build that set
   `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1` needed no Firebase configuration at
   all, could name any project, and skipped every check below it.
2. **Nothing required `EXPO_PUBLIC_CONTENT_SOURCE=remote`.** A release build
   without it serves the seeds compiled into the binary: full catalogue, no
   errors, and nothing anyone publishes ever arrives.
3. **Nothing refused the retired project.** It exists and answers, which is the
   worst kind of wrong backend.

## Decision

### The environment must say what it is, completely

`config/env.js` now refuses, for staging and production: a missing or non-remote
content source, the emulator flag or an emulator host, a project id containing
`wisdom-wafers`, and — where the build needs it — a missing `EAS_PROJECT_ID`
(without which `eas build` creates a *new* project rather than joining the
existing one). The emulator exemption applies to development only.

`check:config` asserts each of these fails the build, because a validation rule
with no failing test is a rule nobody has seen work.

### A verifier that prints identity and never secrets

`npm run verify:env` reads the resolved config and the live project: which
sign-in providers are enabled, whether the public config document is readable,
whether the bucket exists, whether a callable is deployed *and refuses an
unauthenticated call*. The API key is fingerprinted, never printed. The output
is designed to be pasted into a release record.

It loads `.env` itself. The first version did not, and reported every value as
unset on a machine where they were all present — a false all-clear, which is the
one answer a verifier must never give.

### Provisioning is two idempotent commands

`deploy-staging.sh` deploys rules and indexes **before** functions — a function
that is live while the rules are still open is the worse ordering — then Storage
rules, then functions, then lists what was deployed. `bootstrap-project.mjs`
sets staff claims, merges `appConfig/public` (so an operator's maintenance flip
is not undone), and publishes the launch catalogue **through `publishSeed`**,
never as hand-written documents. A revision that is already live is immutable,
so it is left alone and reported. Both refuse a `demo-` project, both refuse the
retired one, and neither prints a credential or sets a password.

### The disclosures a build cannot ship without

A privacy policy, terms, a monitored support address, the version *and* build
number, and a statement of how to delete an account — reachable from inside the
app, next to the control that does it. None existed.

The version alone cannot identify a build: three internal APKs share `1.0.0`,
and "which build were you on?" is the first question a crash report has to
answer. `buildNumber()` reads the remote-sourced version code.

## Consequences

- The pre-rebrand project cannot be used by a release build. That is deliberate
  and irreversible without editing `RETIRED_PROJECT_IDS`.
- A development build is unchanged: no backend at all is still the guest-first
  promise, and the emulator is still the other supported shape.
- The two policy URLs point at pages that are not yet published. The test
  asserts they are https and not placeholders; that they *resolve* is a
  by-hand check before the first external build, recorded as a `todo` rather
  than silently passing.
- Everything from "create the project" onwards needs credentials. The exact
  sequence is in `docs/runbooks/environments.md`, and step 5 —
  `verify:env` all green — is the gate before a build is worth making.
