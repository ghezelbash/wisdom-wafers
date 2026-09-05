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

## 2 · Credentials for the bootstrap — no key file needed

**"Generate new private key" is often greyed out, and that is a good thing.** A
Workspace organisation enforcing `constraints/iam.disableServiceAccountKeyCreation`
is the usual reason: a downloaded key is a long-lived secret that cannot be
revoked by signing out, and Google now discourages them by default.

Use Application Default Credentials instead. They are short-lived, scoped to
your own account, and there is no file for anyone to leak:

```bash
brew install --cask google-cloud-sdk
gcloud auth application-default login
gcloud auth application-default set-quota-project dananeh-staging
```

`applicationDefault()` in `firebase-admin` picks these up with no configuration,
and `scripts/bootstrap-project.mjs` prints which of the two it used.

If your organisation *does* allow key creation and you would rather use one:
Console → **Project settings → Service accounts → Generate new private key**,
saved **outside the repository** (`~/.config/dananeh/staging-sa.json`), then
`export GOOGLE_APPLICATION_CREDENTIALS=…`. Never in Git, a CI log, or a message.

## 2b · `google-services.json` is not used by this app

The console offers it when you register an Android app. Download it if you like,
but nothing here reads it: the app talks to Firebase through the **JS SDK**,
which is configured entirely from `EXPO_PUBLIC_FIREBASE_*`. That file belongs to
the native SDKs — React Native Firebase, FCM, Crashlytics — and arrives with the
native migration.

It is git-ignored, along with `GoogleService-Info.plist`, because it is
per-project: a staging file committed once is a file somebody later builds
production against.

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

## 4b · Grant the build service account — new projects need this

The first functions deploy into a fresh project fails like this:

```
Build failed with status: FAILURE. Could not build the function due to a
missing permission on the build service account. If you didn't revoke that
permission explicitly, this could be caused by a change in the organization
policies.
```

It is not your code and not the deploy command. Since 2024 Cloud Functions
builds run as the **Compute Engine default service account**, and a new project
— particularly one inside a Workspace organisation — does not get the build role
granted automatically.

```bash
gcloud projects add-iam-policy-binding dananeh-staging \
  --member="serviceAccount:1066103901472-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

Or in the console: **IAM & Admin → IAM → Grant access**, principal
`1066103901472-compute@developer.gserviceaccount.com`, role **Cloud Build
Service Account**.

Then redeploy. Wait a minute or two first — IAM changes take a moment to reach
the build system, and an immediate retry can fail with the same message.

### How to tell it is still wrong

`firebase deploy` can print *"Functions successfully deployed"* on the same run
that failed every function, because a later step's error replaces the earlier
summary. The truthful signal is the state:

```bash
npx firebase functions:list --project dananeh-staging --debug 2>&1 \
  | grep -oE '"state":"[A-Z_]+"' | sort -u
```

`ACTIVE` is deployed. `FAILED` with `CloudRunServiceNotFound` means the metadata
exists and the Cloud Run service behind it does not — the callable URL returns a
Google 404, and the app cannot reach its backend. `npm run verify:env` catches
the same thing from outside, which is why it is the gate.

## 4c · Make the callables invokable

A 2nd-gen callable is a Cloud Run service, and it is reachable only if
`allUsers` holds `roles/run.invoker`. `firebase deploy` normally grants that
itself — but its `SetIamPolicy` can lose an etag race against the other policy
writes the same deploy is making:

```
SetIamPolicy | Exception calling IAM: There were concurrent policy changes.
The request's ETag ... did not match the current policy.
```

When that happens the deploy still reports success, the functions still reach
`ACTIVE`, and every call returns **403 Forbidden** from Google's front end. The
app looks like it has no network.

Re-running `firebase deploy --only functions` usually fixes it. If it does not:

```bash
gcloud auth login
gcloud config set project dananeh-staging

for f in publish createContentDraft startCorrection submitForReview review \
         publishApproved rollback ingestProgress submitReport deleteMyAccount \
         beginDeleteMyAccount resumeDeleteMyAccount myAccountDeletionStatus \
         recordTelemetryBatch; do
  gcloud run services add-iam-policy-binding "$(echo "$f" | tr '[:upper:]' '[:lower:]')" \
    --region=europe-west1 --member=allUsers --role=roles/run.invoker
done
```

**Only the callables.** `dailyOpsDigest` and `sweepTelemetry` are scheduled:
Cloud Scheduler invokes them with its own identity, and they must stay private.
Check with `gcloud run services get-iam-policy sweeptelemetry` — no `allUsers`.

### What "public" means here, and why it is right

`allUsers` can *reach* the endpoint; it cannot *do* anything. Every callable
checks `request.auth` first and answers `UNAUTHENTICATED` without it, on top of
the payload caps and per-caller rate limits from release goal 7. The correct
response to an anonymous request is what you should see:

```
$ curl -X POST .../ingestProgress -d '{"data":{"events":[]}}'
{"error":{"message":"sign-in-required","status":"UNAUTHENTICATED"}}   401
```

A **403** means the invoker binding is missing. A **404** means the Cloud Run
service behind the function was never built. Neither is an auth problem in the
app.

### A note on Domain Restricted Sharing

`bashforward.nl` enforces `constraints/iam.allowedPolicyMemberDomains`, and the
obvious guess is that it blocks `allUsers`. **It does not** — the grant above
succeeds under it. If a future project *does* refuse with "one or more users
named in the policy do not belong to a permitted customer", that is when an
org-policy exception is needed, and not before.

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

Put the six web values in **`.env.staging`** — git-ignored, like every `.env.*`
that is not `.env.example` — and the verifier picks it up by variant:

```bash
APP_VARIANT=staging npm run verify:env
```

It reads `.env.staging` when the variant is staging and `.env` otherwise, and
evaluates the config with `EXPO_NO_DOTENV=1` so the two cannot be layered. That
matters: `.env` carries `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1`, and underneath a
staging check it produced "a staging build that addresses the emulator suite" —
a true statement about a build nobody was making.

**Every line must be a ✓.** It reports identity and service health and prints no
secret — the API key is fingerprinted — so the output belongs in the release
record verbatim.

The sign-in checks *use* the providers rather than asking about them: anonymous
sign-in creates an account and deletes it again with the token it just received,
and email/password is probed with an address that cannot exist, which
distinguishes a disabled provider from an unknown account without creating
anything. An earlier version read a field off `identitytoolkit/v1/projects` that
the endpoint does not return, and reported both providers as disabled on a
project where both were on.

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
