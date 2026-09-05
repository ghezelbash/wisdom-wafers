# Provisioning `dananeh-staging` — the owner's checklist

Everything the repository can do is done. This is the part that needs a console
and credentials, in the order it has to happen, with the command to verify each
step. Nothing here is guesswork: each command exists, and each check has a
defined pass condition.

**Do not reuse `wisdom-wafers`.** `npm run verify:env` against the `.env` in this
checkout reports it as it actually is:

```
✗ nothing resolves to the pre-rebrand project
✓ Identity Toolkit answers (200)
✗ anonymous sign-in is enabled
✗ email/password sign-in is enabled
✗ Firestore answers (403)
✗ Storage answers (404)
✗ ingestProgress is deployed in europe-west1 (404)
```

Neither sign-in method is on, Firestore refuses, the bucket does not exist, and
no function is deployed. That is the whole explanation for "I cannot make an
account". A release build naming that project now fails to build.

---

## Before you start

```bash
nvm use                       # Node 22 — what Cloud Functions runs
npm ci
npm i -g firebase-tools
npx eas-cli@latest --version
```

## 1 · The Firebase project

Console → https://console.firebase.google.com

1. **Create** a project with id exactly `dananeh-staging`. It must match the
   `staging` alias in `.firebaserc`, or update that file in the same commit.
2. **Authentication → Sign-in method**: enable **Anonymous** and
   **Email/Password**. Anonymous is not optional — the app signs a reader in
   before the first screen, and without it every launch falls back to a
   device-local identity.
3. **Firestore Database → Create**, location **`europe-west`** (`eur3`). The
   functions are pinned to `europe-west1`; a database somewhere else works but
   pays a round trip on every call.
4. **Storage → Get started**, default bucket, same location.
5. **Project settings → General → Your apps**:
   - **Android**, package `com.dananeh.app.staging` — exactly this, or deep
     links and the build identity disagree;
   - **Web**, any nickname. Its config is the six values the app reads.
6. Copy the web config.

## 2 · A service account for the bootstrap

Console → **Project settings → Service accounts → Generate new private key**.

Save it **outside the repository** — `~/.config/dananeh/staging-sa.json` is
fine. It is the one credential here that can do anything; it must never reach
Git, a CI log or a chat message.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/dananeh/staging-sa.json
```

## 3 · EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # prints the project id
```

Then the `preview` environment, which is what `internal-apk` builds from:

```bash
E=preview
for KEY in API_KEY AUTH_DOMAIN PROJECT_ID STORAGE_BUCKET MESSAGING_SENDER_ID APP_ID; do
  npx eas-cli@latest env:create --environment $E \
    --name EXPO_PUBLIC_FIREBASE_$KEY --value "<from step 1.6>" --visibility plaintext
done

npx eas-cli@latest env:create --environment $E \
  --name EXPO_PUBLIC_ENV_NAME --value staging --visibility plaintext
npx eas-cli@latest env:create --environment $E \
  --name EAS_PROJECT_ID --value "<from eas init>" --visibility plaintext
```

`EXPO_PUBLIC_CONTENT_SOURCE=remote` already comes from `eas.json`. Do **not**
set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` in any release environment — a staging
build carrying it fails to build, deliberately.

`EXPO_PUBLIC_*` values are not secret: Expo inlines them into the bundle, and a
Firebase web API key identifies a project rather than authorising anything.
Security is rules, rate limits and App Check. Keep them `plaintext` so a failed
build can be read.

## 4 · Look before you write

```bash
FIREBASE_PROJECT=dananeh-staging ./scripts/deploy-staging.sh --dry-run --with-content
FIREBASE_PROJECT=dananeh-staging npm run bootstrap:project -- --dry-run
```

The first prints the rules, indexes and the sixteen functions it would deploy,
and reads back what is deployed there now. The second prints the staff accounts,
the config document and the seeds it would publish. Neither writes anything, and
neither needs a credential.

## 5 · Deploy

```bash
export STAGING_EDITOR_EMAIL=…       # three addresses you control
export STAGING_REVIEWER_EMAIL=…
export STAGING_ADMIN_EMAIL=…

FIREBASE_PROJECT=dananeh-staging ./scripts/deploy-staging.sh --with-content
```

Rules and indexes go before functions, on purpose: a function that is live while
the rules are still open is the worse of the two orderings. Content is published
through `publishSeed` — validated strictly, compiled, checksummed, uploaded, and
the pointer moved in a transaction — never as hand-written documents.

Both scripts are idempotent. A revision that is already published is immutable
and is left alone.

**Passwords.** The bootstrap creates the three staff users and sets their claims
and never sets a password: a script that mints one writes it into a shell
history, a CI log, or both. Send each person a reset link from
**Authentication → Users → ⋮ → Reset password**, out of band.

## 6 · Verify

```bash
APP_VARIANT=staging \
EXPO_PUBLIC_ENV_NAME=staging \
EXPO_PUBLIC_CONTENT_SOURCE=remote \
EXPO_PUBLIC_FIREBASE_PROJECT_ID=dananeh-staging \
EXPO_PUBLIC_FIREBASE_API_KEY=… \
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=… \
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=… \
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=… \
EXPO_PUBLIC_FIREBASE_APP_ID=… \
EAS_PROJECT_ID=… \
npm run verify:env
```

**Every line must be a ✓.** It reports identity and service health and prints no
secret — the API key is fingerprinted — so the output belongs in the release
record verbatim.

Then a real round trip:

```bash
FIREBASE_PROJECT=dananeh-staging \
FIREBASE_API_KEY=… \
DIAGNOSE_EMAIL=… DIAGNOSE_PASSWORD=… \
npm run diagnose
```

Sign-in, a callable answering, a callable still *refusing* what it should,
published content with an artifact and a checksum, and a synthetic crash read
back with its version, route and environment — then deleted, so it is never
mistaken for a real one.

## 7 · App Check — register, measure, do not enforce

Console → **App Check**. Register the Android app with **Play Integrity**, and
leave enforcement **off**.

The server already counts verified against unverified calls per day
(`appCheckCoverage/{date}/shards/{n}`, admin-readable). Enforcement is a
decision with a number behind it, not a switch to flip on day one — and there is
a second reason it cannot be flipped yet:

> The Firebase **JS** SDK attests with reCAPTCHA, which needs a DOM. On Android
> the provider is Play Integrity, a native module the JS SDK cannot reach. So
> the mobile builds produce no token at all today, and enforcing would refuse
> every request from every build. It needs React Native Firebase first.

**Rollout, when that lands:** monitor in staging for a week → read the coverage
ratio → enforce in staging → monitor production → enforce per service, Firestore
first. **Rollback:** turn enforcement off in the console; it takes effect within
minutes and needs no new build. Register a debug token per test device before
enforcing anything, or every sideloaded APK is refused by definition.

Do not disable the callable guard's rate limits or payload caps as a shortcut —
they are the protection that exists today.

## What to hand back

For the release record:

- the `verify:env` output, verbatim;
- the project id, the Android app id, the web app id, and the region;
- `firebase functions:list` output and the deploy timestamp;
- the bootstrap summary (which seeds published, which were already live);
- the App Check registration decision and the date enforcement will be
  reconsidered.

Nothing in that list is a secret. The service-account key, the keystore and the
staff passwords are not in it, and must not be.
