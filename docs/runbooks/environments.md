# Environments, Firebase and EAS

Three environments, three Firebase projects, three app identities that can sit
on one device at once.

| variant | package / bundle id | scheme | Firebase project | EAS environment | channel |
|---|---|---|---|---|---|
| `development` | `com.dananeh.app.dev` | `dananeh-dev` | `dananeh-dev` (or the emulator) | `development` | `development` |
| `staging` | `com.dananeh.app.staging` | `dananeh-staging` | `dananeh-staging` | `preview` | `preview` |
| `production` | `com.dananeh.app` | `dananeh` | `dananeh-prod` | `production` | `production` |

`npm run check:config` asserts the first three columns, and asserts that a build
which is **not** configured for the environment it claims fails rather than
producing a binary. It runs in CI on every push.

## The rule that stops the mistake

Every environment sets `EXPO_PUBLIC_ENV_NAME`, and it must equal `APP_VARIANT`.

Project ids are named by whoever created them, so a staging build carrying
production's Firebase config cannot be caught by inspecting the config itself.
Whoever fills in the EAS environment states which one it is, and the build
compares. A mismatch fails at config-evaluation time — before Metro starts.

Development is exempt: working with no backend at all is the guest-first
promise, and the emulator is the other supported shape.

## Local development

```bash
cp .env.example .env      # fill in, or leave Firebase blank and use the emulator
npm run emulators         # auth on 9099, Firestore on 8181, Storage on 9199
npm run seed:emulator     # editor/reviewer/admin accounts and one draft
npm start
```

**`APP_VARIANT` comes from the shell, not from `.env`.** Expo exports only
`EXPO_PUBLIC_*` into the environment `app.config.ts` is evaluated in, so setting
it in a file has no effect — it would silently fall through to `production` and
fail. The npm scripts (`start`, `web`, `android`, `export:web`, `prebuild`) set
it; EAS build profiles set it for a build. Running `npx expo start` directly
needs `APP_VARIANT=development` in front of it.

### Signing in locally

**A development build does not reach a real Firebase project unless told to.**
Anonymous sign-in creates real accounts, so a stray `npm run web` must not do it
by accident. With neither flag set, `isFirebaseConfigured` is false, the app
runs on a device-local identity, and creating an account or signing in reports
*"signing in is not available in this build"* — which is a configuration
problem, not a connection one.

Pick one:

```bash
# Recommended. Nothing real is created, and it works offline.
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1     # in .env
npm run emulators                        # in another terminal
npm run seed:emulator                    # editor/reviewer/admin + one draft

# Or opt in to a real project, deliberately.
EXPO_PUBLIC_ALLOW_LIVE_FIREBASE=1        # in .env
```

Both belong in **`.env`**, not the shell — and after changing either, restart
Metro with `--clear`. It serves a stale bundle otherwise, and the flag appears
to have no effect.

The real project also needs **Anonymous** and **Email/Password** enabled, and
Cloud Firestore actually created. A project where Firestore was never enabled
answers `PERMISSION_DENIED — Cloud Firestore API has not been used in project …
or it is disabled`, and content, progress and sync all fail while auth appears
to work.

`.env` is git-ignored and `tests/static/secrets.test.ts` fails if it is ever
committed. Staging and production values live in the EAS environment, never in
a file.

---

# What has to be done once, by a human

Everything below needs credentials or a dashboard. The code is complete and
`npm run check:config` passes; these are the values it needs.

## 1 · Firebase projects

For **each** of `dananeh-dev`, `dananeh-staging`, `dananeh-prod`
(https://console.firebase.google.com):

1. Create the project. The ids must match `.firebaserc`, or update that file.
2. **Authentication → Sign-in method**: enable **Anonymous** and
   **Email/Password**. Anonymous is not optional — the app signs a reader in
   before the first screen.
3. **Firestore Database**: create in `eur3` (or the region closest to readers).
4. **Storage**: create the default bucket.
5. **Project settings → General → Your apps**:
   - add an **Android** app with the package for that variant (see the table);
   - add a **Web** app — the web SDK config is what the app reads.
6. Copy the web app's config. Those six values are the `EXPO_PUBLIC_FIREBASE_*`
   variables.

Then deploy rules, indexes and functions to each:

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project dananeh-staging
npm run build:functions
npx firebase deploy --only functions --project dananeh-staging
```

## 2 · Staff roles

Custom claims are not settable from a client. Once per person, per project:

```bash
# With a service-account key exported as GOOGLE_APPLICATION_CREDENTIALS
node -e "require('firebase-admin').initializeApp();\
require('firebase-admin').auth().getUserByEmail(process.argv[1])\
.then(u=>require('firebase-admin').auth().setCustomUserClaims(u.uid,{admin:true}))\
.then(()=>console.log('ok'))" you@example.com
```

Roles are `admin`, `editor`, `reviewer`. An editor cannot approve their own
draft — that is enforced in the Function, not by the claim.

## 3 · EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # creates the project, prints the project id
```

Put the project id where `app.config.ts` reads it — as `EAS_PROJECT_ID` in each
EAS environment, or exported locally. It is required for EAS Build **and** for
push notifications.

Then create the environments. Repeat per environment (`preview` shown):

```bash
E=preview
for KEY in API_KEY AUTH_DOMAIN PROJECT_ID STORAGE_BUCKET MESSAGING_SENDER_ID APP_ID; do
  npx eas-cli@latest env:create --environment $E \
    --name EXPO_PUBLIC_FIREBASE_$KEY --value "…" --visibility plaintext
done

npx eas-cli@latest env:create --environment $E --name EXPO_PUBLIC_ENV_NAME \
  --value staging --visibility plaintext
npx eas-cli@latest env:create --environment $E --name EAS_PROJECT_ID \
  --value "…" --visibility plaintext
```

`EXPO_PUBLIC_*` values are **not secret** — Expo inlines them into the bundle,
and a Firebase web API key identifies a project rather than authorising it.
Security comes from rules and App Check. Keep them `plaintext` so they are
readable when a build goes wrong; keep anything genuinely secret out of
`EXPO_PUBLIC_*` entirely.

## 4 · Android signing

```bash
npx eas-cli@latest credentials --platform android
```

Let EAS generate and store the keystore, **or** upload an existing one. The same
keystore must be used for every build of a package name — a device will not
install an update signed by a different key. Back it up:

```bash
npx eas-cli@latest credentials --platform android   # → download keystore
```

## 5 · The build

```bash
npx expo install --check
npm run typecheck && npm run lint && npm test -- --ci && npm run test:emulator
npm run check:config
npx eas-cli@latest build --platform android --profile internal-apk
```

`internal-apk` is `distribution: internal` with `buildType: apk`, on the staging
backend and the `preview` channel — an installable APK with a shareable URL,
rather than the AAB `production` makes.

---

# What I need from you

The code is ready. These are the values only you can produce:

| # | What | Where it comes from |
|---|---|---|
| 1 | Confirmation the three project ids in `.firebaserc` are the ones you want | your decision |
| 2 | Six `EXPO_PUBLIC_FIREBASE_*` values **per environment** | Firebase console → Project settings → web app config |
| 3 | The EAS project id | `eas init` output |
| 4 | Anonymous **and** Email/Password enabled in each project | Firebase console → Authentication |
| 5 | Firestore and Storage created in each project | Firebase console |
| 6 | An Android app registered per package name, in the matching project | Firebase console |
| 7 | Whether EAS should generate the Android keystore or you will upload one | your decision |
| 8 | The email addresses that should hold `admin` / `editor` / `reviewer` | your decision |

Steps 1–3 are enough to run `eas build --profile internal-apk`. Steps 4–6 are
what make sign-in, content and downloads work in the resulting APK.
