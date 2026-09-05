# Dananeh — Release Gap Closure Goals for Claude Code

Date: 2026-09-05  
Repository: `/Users/erfan/Projects/Personal/wisdom-wafers`  
Continues: `CLAUDE_CODE_RELEASE_GOALS.md` Goals 1–12  
Target: a signed, installable Android staging APK that works without Metro or a developer machine and is ready for a controlled internal beta.

## Current stage

The product is no longer a prototype. The application code, local Firebase stack, content pipeline, CMS, branding, and most automated quality gates are at an early release-candidate stage. It is **not yet a distributable product**, because staging has not been provisioned, no signed APK exists, and native device QA has not been signed off.

Do not redo Goals 1–12. Close only the verified gaps below, then provision staging, build the APK, and collect release evidence.

## Execution contract

1. Read `AGENTS.md`, `CLAUDE.md`, the relevant ADRs, and the release/environment runbooks before changing code.
2. Reconfirm each baseline fact before implementation; the repository may have moved since this document was written.
3. Work through Goals 13–18 in order. Keep each goal independently reviewable and committed.
4. Do not mark a goal complete because code exists. Every acceptance criterion needs automated or captured evidence.
5. Backward compatibility with unpublished Firebase data is not required. Prefer a clean schema and delete/reseed staging when necessary.
6. Preserve unrelated changes and never use destructive Git commands.
7. Never commit `.env`, Firebase service accounts, keystores, passwords, tokens, EAS credentials, downloaded APKs, or other secrets.
8. Do not weaken validation, rules, App Check, rate limits, or tests to make a build pass.
9. Use the Firebase Emulator Suite for destructive tests. Do not aim integration tests at a live project.
10. If a step requires owner credentials or console access, complete all code-side preparation first and stop with an exact owner-action checklist. Do not claim external work is complete without evidence.
11. Keep user-facing Persian copy natural, RTL-safe, and consistent with the «دانانه / دانه / رشد» vocabulary.
12. After every goal, run `git diff --check`, document verification results, and update factual status documents in the same commit.

## Verified baseline before these goals

Reconfirm, then record any differences:

- The Goals 1–12 pull request is merged and `origin/main` contains the reviewed tree.
- `npm run lint`, `npm run typecheck`, `npm run check:config`, `npm run check:events`, and `npm run check:e2e` pass.
- `APP_VARIANT=development EXPO_NO_DOTENV=1 npx expo-doctor` passes all 21 checks.
- Unit/component tests pass: 24 suites, 350 tests.
- Emulator tests pass: 23 suites, 297 passed and 1 todo.
- `npm run export:web` and `npm run export:android` pass.
- A seeded full local stack starts Auth, Firestore, Storage, and Functions; `npm run smoke:local` passes all 24 checks.
- A previous Android native debug CI build passed. The first post-merge `main` native job was still running at audit time and must be checked again.
- No APK or AAB and no completed file under `docs/release/` exists.
- Firebase CLI and EAS CLI were not authenticated during the audit.
- The local ignored `.env` still refers to the retired `wisdom-wafers` project and is intentionally rejected for staging.
- `https://dananeh.app`, `/privacy`, and `/terms` did not resolve at audit time.

---

# Goal 13 — Close the remaining security and quality defects

Priority: P0 before any external tester  
Dependencies: none  
Owner access: not required

## 13.1 Replace the deletion receipt with a real cryptographic capability

The current implementation in `functions/src/account/delete.ts` uses `Math.random`, emits 32 hex characters, stores the bearer secret in plaintext, and is described elsewhere as a 256-bit secret. This is not an acceptable deletion capability.

Implement a clean unpublished-data design:

1. Generate at least 256 bits with Node's cryptographically secure RNG.
2. Return an opaque URL/callable-safe representation to the client.
3. Never store the raw receipt. Store a versioned SHA-256 or stronger digest and compare a digest of the supplied receipt.
4. Avoid secret-dependent early comparison when comparing raw binary values; use a safe fixed-length comparison where relevant.
5. Keep begin/resume/status idempotent and preserve the response-loss recovery property after Auth deletion.
6. Validate receipt encoding and exact entropy-derived length at the callable boundary. A permissive `length < 16` check is insufficient.
7. Do not log the receipt, its raw bytes, or request payloads containing it.
8. Since there is no live data to preserve, migrate the schema cleanly and update tests, comments, types, runbooks, and emulator seed/cleanup code together.

### Acceptance criteria

- No production deletion receipt path uses `Math.random`, timestamps, UUID v4 assumptions, or another non-CSPRNG source.
- A newly stored deletion job contains only a digest/version, never the bearer receipt.
- Valid receipt can resume and inspect exactly its own deletion job after the Auth record is gone.
- Wrong, malformed, truncated, replayed-against-another-UID, and randomly guessed receipts are rejected without revealing job/account existence beyond the existing documented contract.
- Existing tests for recent login, retry, partial failure, response loss, and idempotency continue to pass.
- New emulator/unit tests cover the digest-at-rest and invalid-receipt cases.
- Documentation and comments state the actual entropy and representation correctly.

## 13.2 Remove the Remote Config open handle

`src/platform/remote-config.ts` races a fetch against `setTimeout` but does not clear the timer when fetch wins. `npm test -- --ci --detectOpenHandles` reports eight open `Timeout` handles.

### Acceptance criteria

- The timeout is cleared on success, rejection, and timeout.
- Timeout and late-resolution behavior is deterministic and covered with fake timers.
- `npm test -- --ci --detectOpenHandles` exits cleanly without open-handle output or forced exit.
- Do not use Jest `forceExit` or suppress the warning.

## 13.3 Finish nested Firestore validation

`notificationPreferences` currently has an allowed-key check but incomplete value validation.

Validate, at minimum:

- `enabled`: boolean;
- `pace`: documented finite enum or nullable value;
- `timeOfDay`: documented finite enum or nullable value;
- `reminderTime`: strict `HH:mm` value with a valid 24-hour range or nullable value;
- exact key set/allowed keys and sensible string/list sizes;
- immutable/server-owned fields remain immutable.

Apply the same validation to create and update, and ensure partial map replacement cannot bypass it.

### Acceptance criteria

- Emulator rules tests accept every valid preference shape used by the app.
- Tests reject wrong types, unknown enums, malformed times, out-of-range times, unexpected keys, oversized values, and cross-user writes.
- Client and rules share the same documented domain contract even if rules cannot import TypeScript schemas.

## 13.4 Make status documentation truthful

Clean duplicated and contradictory rows in `docs/internal-beta.md`. In particular, do not claim both that preference sync is one-way and that it does not exist. Update the export statement to match the actual local-plus-account export implementation. Preserve genuine unsigned device checks.

### Goal 13 verification

```bash
npm run lint
npm run typecheck
npm test -- --ci --detectOpenHandles
npm run test:emulator
npm run check:config
npm run check:events
npm run check:e2e
git diff --check
```

### Evidence to provide

- Test counts and exact verification commands.
- A redacted example deletion job showing digest/version but no receipt.
- A short threat-model note covering receipt theft, guessing, replay, logging, and response loss.
- Before/after rule-test matrix for `notificationPreferences`.

---

# Goal 14 — Finish durable two-device account sync

Priority: P0 for the stated product promise  
Dependencies: Goal 13  
Owner access: not required

## Problem to close

Preference transport and merge helpers exist, but account restoration does not apply remote preferences back into the session. Preference and bookmark pushes are direct Firestore calls; a failure is logged and the user's intent is not guaranteed to retry after reconnect/restart.

## Scope

1. Make the versioned sync contract in ADR 19 the actual runtime contract for preferences and saved state.
2. Restore remote preferences during account hydration/sign-in and apply the documented whole-object last-write-wins policy using `updatedAt`.
3. Route preference and bookmark intents, including un-save, through the one durable outbox or an equally durable mechanism that survives app restart. Do not create a second ad-hoc queue.
4. Retry pending sync after reconnect, app relaunch, and authenticated-session restoration.
5. Preserve immediate offline-first UI updates; network latency must not block toggles or settings changes.
6. Make acknowledgement, retry, rejection/dead-letter behavior explicit and observable.
7. Prevent debounce races from dropping the last preference state during sign-out, backgrounding, provider unmount, or rapid edits.
8. Ensure account switching cannot send Device A's queued preference/bookmark intent under Device B's UID.
9. If the outbox envelope or callable contract changes, update shared schemas, backend handlers, rate/item limits, App Check coverage, rules, migration, and telemetry together.

## Acceptance criteria

- Device A changes interests, pace, reminder settings, bookmark and un-bookmark state; Device B receives the intended final state after sign-in.
- A change made offline survives process termination and drains after reconnect.
- Rapid changes converge to the last valid intent without creating unbounded queue entries.
- Un-save propagates to a device that previously had the seed saved.
- Local and remote preference conflicts follow the documented timestamp policy and have deterministic tests.
- A rejected malformed event dead-letters with a useful non-PII reason; a transient failure retries with bounded backoff.
- Signing out or changing accounts cannot leak or misattribute queued data.
- Emulator integration tests cover two-device restore, offline/restart/reconnect, duplicate delivery, removal, conflict, account switching, and partial batch acknowledgement.
- `AuthContext`/account restore has a test that would fail if remote preferences were ignored.

## Verification

Run all Goal 13 commands plus the full local stack:

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run seed:emulator
npm run smoke:local
```

The smoke script must use bounded request timeouts and fail quickly with a useful message if the emulators are absent. It must not hang indefinitely.

## Evidence to provide

- Updated field-by-field conflict matrix.
- Emulator output for the two-device and restart scenarios.
- Redacted before/after Firestore documents and outbox records.
- Confirmation that no additional queue/storage abstraction was introduced.

---

# Goal 15 — Freeze a reproducible release-candidate quality gate

Priority: P0 before building the APK  
Dependencies: Goals 13–14  
Owner access: not required

## Scope

1. Ensure the release branch/commit is based on the current `origin/main`. The auditor's local `main` ref was stale; update it safely without discarding work.
2. Make the CI quality gate exercise the corrected timeout behavior and remain free of open handles.
3. Ensure full Firebase Functions work under the declared Node 22 runtime. Local verification must use Node 22 rather than silently substituting Node 26.
4. Review the Firebase Functions SDK emulator warning. Upgrade only if supported and low-risk; otherwise pin/document the reason and create a dated follow-up. Do not casually upgrade immediately before the build.
5. Give local smoke/diagnostic network requests bounded timeouts.
6. Re-run Android native generation from clean generated output and verify manifest/resources with the existing checker.
7. Ensure CI uploads useful logs/artifacts on failure while never uploading secrets.
8. Update `BUILD_TODO.md`, `docs/internal-beta.md`, and any release-audit status claims to the same factual snapshot.

## Acceptance criteria

- The exact candidate commit is green in GitHub Actions.
- Unit tests exit naturally without lingering handles.
- Functions build and full local smoke run on Node 22.
- A missing emulator/backend produces a bounded, actionable failure rather than a hang.
- Native Android debug build and `check:android` succeed from the candidate commit.
- No required job uses `continue-on-error`, `forceExit`, `|| true`, skipped suites, or equivalent suppression.
- All generated Dananeh splash/icon resources are present and no Expo placeholder branding appears.

## Required verification

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --ci --detectOpenHandles
npm run test:emulator
npm run check:config
npm run check:events
npm run check:e2e
APP_VARIANT=development EXPO_NO_DOTENV=1 npx expo-doctor
npm run export:web
npm run export:android
npm run prebuild
npm run check:android
git diff --check
```

### Evidence to provide

- Exact candidate SHA.
- Green CI URL for that SHA, including Android native build.
- Node/Java/Expo/EAS/Firebase CLI versions used.
- Final suite/test counts and generated package/application identifiers.

---

# Goal 16 — Provision and verify a clean `dananeh-staging`

Priority: P0 release infrastructure  
Dependencies: Goal 15  
Owner access: Firebase/Google Cloud and EAS access required

Follow `docs/runbooks/environments.md`. Do not reuse or repair the retired `wisdom-wafers` project. Do not use production for beta setup.

## Code-side preparation before requesting owner action

1. Recheck `.firebaserc`, `firebase.json`, `app.config.ts`, `eas.json`, deploy/bootstrap scripts, rules, indexes, region, bucket handling, and package name for staging.
2. Confirm `dananeh-staging`, `com.dananeh.app.staging`, `dananeh-staging` scheme, preview channel, and remote content source agree everywhere.
3. Ensure deploy/bootstrap scripts are idempotent, reject retired/demo/production targets when staging is expected, and never print secrets.
4. Add a dry-run/preflight mode if the owner otherwise cannot safely see intended mutations before deployment.
5. Prepare an exact owner-action checklist for console-only operations.

## Owner-assisted provisioning

1. Create/select the `dananeh-staging` Firebase project.
2. Enable Anonymous and Email/Password authentication.
3. Create Firestore and the default Storage bucket in the documented region.
4. Register the staging Android and web applications.
5. Configure EAS `preview` environment variables, including `EXPO_PUBLIC_ENV_NAME=staging` and the Firebase web configuration.
6. Deploy Firestore rules/indexes, Storage rules, and Functions using the repository script.
7. Bootstrap `appConfig/public`, roles, launch catalogue, immutable revisions, manifests, checksums, and Storage bundles through the real publish pipeline.
8. Establish an App Check rollout appropriate for internal beta: register the Android app/provider, verify tokens/metrics, and document when enforcement will be enabled. Do not disable callable safeguards globally as a shortcut.

## Acceptance criteria

- `APP_VARIANT=staging npm run verify:env` passes every check.
- The environment resolves only to `dananeh-staging`; retired-project and cross-environment checks still fail closed.
- Auth supports anonymous, sign-up, sign-in, password reset, reauthentication, and deletion on staging.
- Firestore, Storage, and every required callable are deployed in the configured region.
- A bootstrap rerun is idempotent and does not overwrite immutable revisions.
- The staging catalogue contains representative Persian content, including media and every supported block type needed for QA.
- A staging admin/editor/reviewer workflow works without client-side privileged writes.
- Rules deny unauthorized cross-user and editorial operations in deployed staging spot checks.
- No real credential or personal test data is committed.

## Evidence to provide

- Redacted `verify:env` output.
- Firebase project id, app ids/package, region, deployed Functions list, rules deployment timestamp, and bootstrap summary.
- Synthetic test accounts/roles delivery method documented outside Git; never put passwords in the repository.
- App Check registration/enforcement decision and rollback procedure.

If credentials are unavailable, Goal 16 remains **blocked/owner action required**, not complete.

---

# Goal 17 — Produce the first signed, installable staging APK

Priority: P0 release artifact  
Dependencies: Goal 16  
Owner access: EAS account and Android signing access required

## Scope

1. Initialize/link the EAS project if it is not already linked.
2. Confirm `internal-apk` produces an APK, uses staging identity/backend, and cannot accidentally resolve to development or production.
3. Generate or select the long-lived Android keystore in EAS. Back it up using the documented secure owner procedure; do not place it in Git or the workspace.
4. Set an intentional app version and monotonically increasing Android `versionCode`.
5. Run every pre-build gate against the exact commit to be built.
6. Build with `internal-apk` and retain the immutable EAS build URL/id.
7. Download the artifact to a safe ignored location only when needed for verification; calculate SHA-256.
8. Create `docs/release/<YYYY-MM-DD>-internal-apk.md` from the template and fill every field. Use `Unknown` with an explanation rather than leaving blanks.

## Acceptance criteria

- The artifact is a signed APK, not merely a JS export, debug Gradle output, or AAB.
- It installs on a clean Android device directly from the EAS artifact URL.
- Package is `com.dananeh.app.staging`; app name/icon/splash are Dananeh; it can coexist with future production.
- It launches and functions with Metro stopped, USB disconnected, and no developer machine.
- It connects only to `dananeh-staging`, fetches remote published content, and can continue with downloaded content offline.
- Fresh guest, account creation, sign-in, sign-out, password reset entry, sync, report, and deletion paths reach the staging backend.
- Release record contains commit SHA, green CI URL, EAS build id/URL, version/versionCode, package, backend, build time, artifact URL, and APK SHA-256.
- The repository remains free of credentials, keystores, and APK binaries.

## Canonical build command

```bash
npx eas-cli@latest build --platform android --profile internal-apk
```

Do not mark Goal 17 complete from an EAS queue/build-start message. Completion requires a successful artifact plus install proof.

---

# Goal 18 — Native QA, legal readiness, and internal-beta Go/No-Go

Priority: P0 before sharing beyond the development team  
Dependencies: Goal 17  
Owner access: physical/virtual Android devices and control of `dananeh.app`

## 18.1 Automated and manual device QA

Run the repaired Maestro flows against the exact APK from Goal 17, then complete `docs/runbooks/native-qa.md` and `docs/internal-beta.md` without assumed checks.

Cover at least:

- clean install and three cold starts;
- fresh guest to first completed seed;
- sign-up, sign-in, sign-out, password-reset entry, reauthentication, and deletion;
- remote catalogue/bundle/checksum path;
- progress, bookmark/un-bookmark, review, preferences, and second-device sync;
- offline launch, offline progress, process death, reconnect, and outbox drain;
- search/discovery and empty/loading/error/retry states;
- image/audio/video and every supported content block;
- Persian RTL, mixed Persian/Latin/numeric strings, keyboard avoidance, and Jalali/Gregorian behavior where applicable;
- 200% font size, screen reader/TalkBack, focus order, labels, contrast, reduced motion, and touch targets;
- notification denied/granted/scheduled/tapped/cold-start behavior and quiet hours;
- low storage, interrupted download, corrupt cache recovery, slow/offline network, and backend maintenance/forced-update gates;
- install/upgrade behavior with the same signing key.

Test at least one modern Android version and one lower supported version, with one physical device when available.

## 18.2 Legal and support endpoints

Before any external tester receives the build:

1. Make `https://dananeh.app/privacy` and `/terms` publicly reachable over HTTPS.
2. Ensure the documents accurately describe guest/account data, Firebase services, analytics/crash collection, notifications, content reports, export, retention/anonymisation, and account deletion.
3. Make the support address reachable and monitored.
4. Add an automated release check that fails external-release readiness when legal URLs do not return acceptable HTTPS responses. Keep local/offline unit tests deterministic; perform live checks in an explicit release job.
5. Replace the legal `it.todo` only after the real endpoints exist and the assertion is meaningful.

## 18.3 Release decision

Triage every discovered defect:

- P0: security, data loss/cross-account leakage, crash/blocker, wrong backend, broken sign-in/content/deletion — must fix and rebuild.
- P1: core flow or serious accessibility/RTL/offline failure — must fix before external beta unless explicitly accepted by the owner with rationale.
- P2/P3: record in Known Issues with impact and workaround.

Any native/config-plugin change requires a new binary and a new release record. Do not silently reuse evidence from the prior APK.

## Acceptance criteria

- Maestro/device flow results are attached or linked from the release record.
- Every row in native QA and internal-beta checklists is signed with device/build evidence or explicitly marked not applicable with rationale.
- No P0 remains; every P1 is fixed or explicitly accepted by the owner.
- Crash-free launch, backend round trip, content delivery, offline continuation, sync, notification, RTL, and accessibility evidence exists for the exact APK.
- Privacy, Terms, and support endpoints are live and open from inside the APK.
- `docs/release/<date>-internal-apk.md` ends with an explicit Go/No-Go, decision owner, known issues, monitoring plan, and rollback instructions.

---

# Final definition of done

Dananeh is ready for controlled internal beta only when all of the following are true:

- [ ] Goal 13 security/rules/open-handle defects are closed.
- [ ] Goal 14 preference/bookmark restore and durable offline sync are proven.
- [ ] Goal 15 candidate commit has a truthful fully green quality gate.
- [ ] Goal 16 clean staging environment passes `verify:env` and backend smoke checks.
- [ ] Goal 17 signed staging APK exists, installs without Metro, and has a complete release record.
- [ ] Goal 18 native/device/RTL/accessibility/offline tests are signed off.
- [ ] Privacy, Terms, and support endpoints are live before external sharing.
- [ ] No P0 is open and any accepted P1 has a named owner and written rationale.
- [ ] Monitoring and rollback paths are usable by the release owner.

## Final handoff expected from Claude Code

Return one concise release report containing:

1. goal-by-goal status: complete, incomplete, or owner action required;
2. commits and changed files for every completed goal;
3. exact test commands, counts, and green CI URLs;
4. unresolved defects by severity;
5. staging verification evidence;
6. EAS build id/URL and APK SHA-256;
7. device/OS matrix and Maestro/manual QA results;
8. legal/support URL verification;
9. link to the completed release record;
10. final Go/No-Go recommendation.

Do not summarize an incomplete owner-dependent step as complete. The desired result is not merely green code: it is one specific, signed APK whose backend, installation, core flows, offline behavior, and release evidence have all been verified.
