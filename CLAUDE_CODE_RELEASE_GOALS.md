# Dananeh — Release Completion Goals for Claude Code

Date: 2026-09-04  
Repository: `/Users/erfan/Projects/Personal/wisdom-wafers`  
Target: a distributable Android staging APK that a real user can install, launch, use as a guest, create/sign into an account, receive published content, continue offline, sync supported data, and delete their account safely.

## 0. Execution contract

Work through the goals in the order below. Do not mark a goal complete because code exists; provide the requested evidence and satisfy every acceptance criterion.

- Read `AGENTS.md`, the relevant ADRs, and the exact Expo SDK 57 documentation before changing code.
- Preserve unrelated user changes. Do not use destructive Git commands.
- Backward compatibility with the current unpublished backend/data is **not required**. Prefer a clean, internally consistent target architecture over compatibility shims.
- Keep every goal reviewable and independently committed.
- Never commit Firebase service-account files, keystores, tokens, passwords, `.env`, or EAS credentials.
- Do not weaken environment validation or security rules merely to make tests pass.
- Use the Firebase Emulator Suite for destructive and integration tests.
- A goal is complete only when its tests, documentation, and evidence are committed with it.
- If a step needs owner credentials or console access, finish all code-side work first, then stop with an exact owner-action checklist. Never claim the external step was completed without evidence.

## Baseline facts from the audit

Reconfirm these before implementation because the repository may have changed:

- `npm run check:config`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: zero errors, two warnings.
- Unit/component tests: 19 suites and 256 tests pass.
- `npm run test:emulator`: fails because `tests/integration/identity-migration.test.ts` reaches `expo/virtual/env.js`, which Jest does not transform.
- The four latest GitHub Actions runs are red.
- `npx expo-doctor`: fails dependency compatibility checks, most importantly AsyncStorage `3.1.1` versus Expo SDK 57's expected version.
- Android native debug compilation in CI succeeds, but there is no staging/release APK artifact.
- The current local `wisdom-wafers` Firebase API key is valid and Auth responds, but Cloud Firestore is disabled for that old project.
- `.firebaserc` expects `dananeh-dev`, `dananeh-staging`, and `dananeh-prod`; the local `.env` still targets the pre-rebrand project.
- Firebase CLI and EAS CLI were not authenticated during the audit.
- `npm run emulators` starts Auth, Firestore, and Storage only. Callable Functions are unavailable on port 5001.
- No tracked APK or AAB exists.

---

# Goal 1 — Restore a truthful, fully green quality gate

Priority: P0  
Dependencies: none  
Owner access: not required

## Scope

1. Fix the plain-Node emulator Jest configuration so `identity-migration.test.ts` runs instead of failing while parsing `expo/virtual/env.js`.
2. Keep the test meaningful. Do not skip the suite, remove assertions, or mock identity migration itself.
3. Resolve Expo SDK 57 dependency mismatches using `npx expo install` and the exact SDK 57 compatibility guidance.
4. Resolve existing lint warnings where reasonable.
5. Remove `continue-on-error: true` from the Expo Doctor CI job after Doctor passes.
6. Ensure CI reports a genuine failure if any required test or Doctor check fails.
7. Update stale test counts and status claims in `BUILD_TODO.md`, `docs/internal-beta.md`, and the release audit.

## Acceptance criteria

- `npx expo-doctor` passes all checks.
- `npm run lint` exits zero without warnings.
- `npm run typecheck` exits zero.
- `npm test -- --ci` exits zero.
- `npm run test:emulator` exits zero and executes `identity-migration.test.ts`.
- Jest exits cleanly without an open-handle warning.
- `npm run export:web` and `npm run export:android` both pass.
- GitHub Actions is green on the goal commit, including the backend and Doctor jobs.
- No test suite or CI job is hidden behind `continue-on-error`, `.skip`, `|| true`, or equivalent suppression.

## Evidence to provide

- Exact commands and final suite/test counts.
- Link to the green GitHub Actions run.
- Short explanation of the Jest transform/stub fix.
- `git diff --check` output.

---

# Goal 2 — Make the local full-stack environment honest and complete

Priority: P0  
Dependencies: Goal 1  
Owner access: not required

## Scope

1. Preserve a lightweight emulator command if useful, but add an explicit full-stack command that starts Auth, Firestore, Storage, and Functions.
2. Ensure Functions are built before or as part of full emulator startup.
3. Update the emulator seeder so a fresh local environment contains:
   - editor, reviewer, and admin accounts with the correct custom claims;
   - at least one normal reader account where required by tests;
   - `appConfig/public` with safe development flags and an open app gate;
   - at least one published Persian seed, its revision record, manifest, and Storage bundle;
   - one draft suitable for the editorial workflow.
4. Make the app's emulator mode connect every relevant adapter to the correct emulator, including callable Functions.
5. Add an automated local full-stack smoke test covering Auth plus at least one real callable.
6. Update README/runbooks with one canonical local startup sequence. Include the Metro `--clear` requirement where it remains necessary.

## Acceptance criteria

- A clean checkout can run the documented local sequence without cloud credentials.
- Auth, Firestore, Storage, Functions, and Emulator UI are reachable on documented ports.
- A seeded user can sign in through the app.
- The app can fetch the seeded published catalogue and open its bundle.
- At least one progress event reaches the Functions emulator and is persisted.
- A content report reaches the Functions emulator and appears in Firestore.
- The CMS can sign in with seeded roles and perform its documented local workflow.
- Tests never contact a real Firebase project.
- Shutting down the suite exits cleanly and does not leave emulator processes running.

## Evidence to provide

- Terminal summary showing all four emulators healthy.
- Automated smoke-test output.
- Screenshots of reader login/catalogue and the seeded CMS workflow.

---

# Goal 3 — Complete account sync semantics

Priority: P0 for the product promise  
Dependencies: Goal 2  
Owner access: not required

## Current gaps to address

- `AccountSync.pushPreferences` and `AccountSync.pushSaved` exist but have no runtime callers.
- Remote reviews are read but not restored onto the device.
- Review events increment an aggregate counter but do not persist review schedule/state.
- Server progress does not fully represent the device resume position.
- Identity-migration failures are swallowed before switching to the new UID.

## Scope

1. Define one explicit, versioned sync contract for:
   - preferences;
   - bookmarks/saved state, including removals;
   - progress and resume position;
   - completion;
   - review state and next due date.
2. Choose server-authoritative versus mergeable fields and document the conflict policy.
3. Route all outbound syncable changes through the durable outbox unless there is a documented reason not to.
4. Persist server-side review state and restore it on a second device.
5. Wire preference and bookmark changes to remote sync for account users while retaining offline-first local behavior.
6. Make identity migration atomic from the user's perspective: do not silently switch identity after migration persistence fails. Provide retry/recovery state.
7. If the cleaner solution requires changing unpublished Firestore schemas, do so and update rules, indexes, seeders, tests, ADRs, and deletion logic together.

## Acceptance criteria

- Device A can bookmark, change preferences, make partial progress, complete a seed, and perform a review; Device B receives the intended supported state after sign-in.
- Unsaving on one device eventually removes the bookmark on another.
- Completion remains monotonic and idempotent.
- Review due dates and counts do not reset when signing in on a second device.
- Offline changes survive restart and drain after reconnect.
- Failed identity migration does not silently strand data under the old UID.
- Emulator integration tests cover conflict, retry, duplicate delivery, removal, and two-device restore.
- Firestore rules reject malformed or unauthorized writes for every new/changed document shape.

## Evidence to provide

- Documented conflict matrix by field.
- Emulator test output for two-device scenarios.
- Before/after Firestore document examples without personal data.

---

# Goal 4 — Enforce remote configuration and app gates at runtime

Priority: P0/P1  
Dependencies: Goal 2  
Owner access: not required

## Scope

1. Replace static feature decisions with a reactive configuration source that screens and services actually consume.
2. Enforce at least:
   - `contentSource`;
   - `downloadsEnabled`;
   - `reviewEnabled`;
   - `remindersEnabled`;
   - `aiTutorEnabled` remaining off.
3. Define when remote config is fetched, cached, refreshed, and reset.
4. Ensure a remotely disabled feature cannot still be entered through deep links, notifications, stale navigation state, or background tasks.
5. Fix app-gate behavior:
   - a forced update must not be bypassable;
   - maintenance behavior must match the product decision;
   - if an offline garden exception is desired, implement it as a narrowly scoped route rather than setting the entire gate to open.
6. Seed and test app-gate configurations locally.

## Acceptance criteria

- Runtime tests prove every supported flag changes actual behavior.
- Deep-link and notification entry points respect disabled features.
- Forced-update mode cannot open the normal application shell.
- Maintenance mode exposes only explicitly approved offline functionality.
- An unavailable or malformed config follows the documented safe fallback.
- The feature flag state does not leak between tests or users.

## Evidence to provide

- Automated tests for every flag and gate state.
- Screenshots of open, maintenance, and forced-update states.
- Short architectural note identifying the single runtime source of truth.

---

# Goal 5 — Harden deletion, authentication recovery, and user data export

Priority: P0 before public distribution  
Dependencies: Goals 2 and 3  
Owner access: not required for emulator validation

## Scope

1. Add an in-product recent-login/reauthentication flow rather than instructing users to sign out manually.
2. Redesign account deletion so response loss after Auth deletion cannot leave the device in an unverifiable state.
3. Use a resumable deletion model that remains observable after destructive server steps. Consider an authenticated initiation plus deletion token/job receipt or another documented secure design.
4. Make every deletion step idempotent and verify all user-owned collections, Storage prefixes, push tokens, aggregates, reports policy, and Auth deletion.
5. Ensure the device is wiped only after a trustworthy terminal result.
6. Expand export beyond device-only data or explicitly narrow the product promise and legal copy.
7. Add recovery behavior for anonymous sign-in failure after sign-out or deletion.

## Acceptance criteria

- Password users can reauthenticate inside the deletion flow.
- Wrong password, expired credential, network loss, timeout, partial server failure, and response loss after Auth deletion are tested.
- Retrying cannot double-delete, corrupt another account, or falsely report success.
- A successful deletion removes all data promised by the UI and returns the app to a fresh guest state.
- A failed deletion leaves a truthful, recoverable state.
- Export contents and deletion copy accurately describe what is included and removed.

## Evidence to provide

- State diagram for deletion and recovery.
- Emulator integration-test output for every failure boundary.
- Firestore/Storage/Auth before-and-after proof using synthetic users.

---

# Goal 6 — Make publishing immutable, transactional, and rollback-correct

Priority: P1  
Dependencies: Goal 2  
Owner access: not required

## Scope

1. Prevent concurrent publishes from overwriting the same supposedly immutable revision artifact.
2. Make revision reservation/creation atomic. Storage writes must use generation/precondition semantics or an equivalent no-overwrite design.
3. Store enough immutable revision metadata to restore the complete catalogue summary during rollback, including title, objective, topic, difficulty, duration, locale, and manifest.
4. Make rollback update all reader-visible fields consistently.
5. Make editorial workflow transitions race-safe. State transition and audit creation must succeed as one logical operation.
6. Make publish finalization and its audit trail recoverable if any step fails.
7. Add a creation workflow to the CMS if content creation still relies on manual Firestore insertion.

## Acceptance criteria

- Two concurrent attempts to publish the same seed revision produce exactly one immutable winner.
- An existing Storage object cannot be silently overwritten.
- Rolling back changes both the artifact pointer and all catalogue metadata to the selected revision.
- Concurrent submit/review/publish actions cannot skip workflow states or create contradictory audit entries.
- Orphaned artifacts/jobs are detectable and have a documented cleanup/recovery procedure.
- Integration tests exercise concurrency and failure injection.

## Evidence to provide

- Concurrency-test output.
- Firestore and Storage snapshots for publish, failed publish, and rollback.
- Updated ADR describing immutability and recovery.

---

# Goal 7 — Tighten Firebase security rules and backend abuse controls

Priority: P1  
Dependencies: Goals 3 and 6  
Owner access: not required for emulator tests

## Scope

1. Require an editor to own a draft before editing it, except for an explicitly documented admin override.
2. Add exact key allow-lists and type/size/range validation for:
   - reviews;
   - device/token documents;
   - notification preferences;
   - saved records;
   - any revised sync documents from Goal 3.
3. Restrict `appConfig` public reads to the intended public document(s).
4. Re-evaluate whether clients should be allowed to write progress directly when the architecture calls the server authoritative.
5. Add server-side payload size limits, batch limits, rate-limit strategy, and abuse controls to public callables.
6. Keep App Check off until the documented rollout, but prepare enforcement-compatible code and metrics.

## Acceptance criteria

- Cross-editor draft modification is denied unless the actor has the documented override.
- Unknown fields, oversized arrays/strings, invalid timestamps, and invalid enum values are denied.
- A user cannot read or write another user's records.
- Public clients cannot forge server-authoritative aggregates, schedules, workflow states, telemetry ownership, or publish state.
- Rules and callable tests include both allow and deny cases for every document/callable.

## Evidence to provide

- Updated rules matrix.
- Emulator rules-test counts and output.
- Brief threat-model update covering client tampering, replay, and abuse.

---

# Goal 8 — Finish telemetry, observability, and release diagnostics

Priority: P1  
Dependencies: Goals 1–4  
Owner access: may be required for production providers; emulator implementation is not blocked

## Scope

1. Either wire or remove unsupported event declarations. At minimum validate the actual funnel for:
   - onboarding start/completion;
   - seed impression/start/completion;
   - download start/success/failure;
   - review completion;
   - notification permission/open;
   - account link/sign-in;
   - content report.
2. Keep search text, email, reflection content, answers, and other PII/private text out of analytics.
3. Add correlation identifiers and build/environment context without user content.
4. Ensure failed outbox telemetry cannot block product-critical progress events.
5. Decide and implement crash reporting for the staging APK, or explicitly define the temporary Firestore-based alerting/retention path.
6. Document dashboards, alert thresholds, retention, and incident ownership.

## Acceptance criteria

- Every declared MVP event has at least one real runtime call and a test, or is removed from the MVP taxonomy.
- PII-guard tests cover nested objects, arrays, suspicious key names, and representative Persian text.
- A synthetic crash/error from staging is visible to the operator with app version, route, and environment.
- Telemetry failures do not prevent progress persistence or normal app use.
- Operators have a tested procedure for detecting auth, callable, content-download, and crash regressions.

## Evidence to provide

- Event coverage table mapping event → runtime location → test.
- Screenshot or emulator proof of received telemetry/crash data.
- Updated observability runbook.

---

# Goal 9 — Finish brand assets and native UX polish

Priority: P1  
Dependencies: Goal 1  
Owner access: not required

## Scope

1. Remove every user-visible Expo starter asset, including the animated splash overlay's `expo-logo.png` and Expo-blue styling.
2. Use the finalized Dananeh logo consistently across:
   - Android launcher icon;
   - adaptive foreground/background;
   - monochrome icon;
   - splash screen in light/dark mode;
   - notification icon;
   - in-app brand marks where applicable.
3. Remove unused starter assets from production bundles.
4. Replace missing launch-seed media or deliberately redesign the block so no broken/placeholder visual ships.
5. Verify Persian RTL, English LTR, maximum font scaling, reduced motion, screen readers, contrast, and touch targets on real Android hardware/emulator.

## Acceptance criteria

- No Expo logo or starter branding appears in source-referenced runtime assets or the Android bundle.
- Cold start transitions from the native Dananeh splash to the app without a second mismatched splash.
- Adaptive and monochrome icons render correctly on supported Android launchers.
- No launch content shows a missing production asset.
- The native QA checklist is completed with screenshots and device/OS details.
- TalkBack and maximum font-size tests reveal no blocked primary flow.

## Evidence to provide

- Light/dark cold-start recording.
- Launcher screenshots for adaptive and monochrome icons.
- Accessibility/native QA record.

---

# Goal 10 — Repair and execute Android end-to-end tests

Priority: P0 before APK sign-off  
Dependencies: Goals 2–9  
Owner access: not required for local emulator; staging backend required for final pass

## Scope

1. Repair the Maestro signup flow:
   - use a deterministic unique email;
   - fill both email and password;
   - remain in the correct create-account mode;
   - assert linked guest progress after signup.
2. Make offline testing prove a remotely downloaded seed works, rather than reopening only bundled content.
3. Add assertions for allowed and rejected deep links; shell output alone is not evidence.
4. Add notification-open routing coverage where automation permits it.
5. Ensure delete-account automation creates and deletes its own synthetic account and verifies the final state.
6. Reduce optional taps that can create false-positive flows.
7. Run the complete suite on a clean Android emulator and at least one real Android device before beta sign-off.

## Acceptance criteria

- Every Maestro flow passes from a documented clean starting state.
- Tests fail when a required control is missing; critical steps are not marked optional.
- Guest completion survives restart and account linking.
- A remote seed is downloaded online, opened after force-stop in airplane mode, and checksum validation remains intact.
- Notification denial does not break the product; notification acceptance/opening follows the intended route.
- Malicious/unapproved deep links open no protected or arbitrary route.
- Account deletion is verified against the staging backend.

## Evidence to provide

- Maestro command output and version.
- Emulator/device model and Android version.
- Screenshots/videos from each critical flow.

---

# Goal 11 — Provision clean Firebase and EAS staging environments

Priority: P0  
Dependencies: Goals 1–10 code-side work  
Owner access: required

## Recommended environment decision

Do not use the pre-rebrand `wisdom-wafers` project for the beta. Since there is no live user data and backward compatibility is not required, provision a clean `dananeh-staging` environment and treat it as disposable until public beta. Provision dev/prod consistently when needed.

## Code-side preparation

1. Make environment validation require every value needed for a staging build, including EAS project identity where appropriate.
2. Ensure no staging/production build can silently fall back to mock content, local-only identity, the emulator, or the old Firebase project.
3. Provide idempotent deploy/bootstrap scripts or exact commands for rules, indexes, Storage rules, Functions, public config, roles, and initial content.
4. Add a read-only environment verification command that prints only non-secret project identity and service health.

## Owner actions

1. Authenticate Firebase CLI and EAS CLI.
2. Create or confirm `dananeh-staging`.
3. Enable Anonymous and Email/Password Auth.
4. Create Firestore and Storage in the selected region.
5. Register Android package `com.dananeh.app.staging` and provide the required Firebase Android configuration through the approved credential mechanism.
6. Link the Expo/EAS project with `eas init`.
7. Configure EAS `preview` environment variables/secrets.
8. Select Android signing: EAS-managed is acceptable for internal beta unless an existing production key policy says otherwise.
9. Assign synthetic admin/editor/reviewer custom claims.
10. Deploy rules, indexes, Storage rules, and Functions.
11. Publish the initial reviewed content through the real pipeline, not manual Firestore writes.

## Acceptance criteria

- A staging environment verifier confirms the correct project ID, package ID, Auth providers, Firestore, Storage, Functions, and public app config.
- The staging app cannot reference `wisdom-wafers` anywhere in its resolved config.
- Anonymous sign-in and Email/Password sign-in work.
- Published catalogue metadata, bundle download, progress ingestion, report submission, telemetry, and deletion work against staging.
- Staff claims enforce the expected CMS roles.
- No secret is printed in logs or committed.

## Evidence to provide

- Sanitized `expo config` identity summary.
- Sanitized environment verification output.
- Firebase deployment output and deployed function names.
- One end-to-end staging smoke-test record.

---

# Goal 12 — Produce and sign off the internal Android APK

Priority: P0 final gate  
Dependencies: Goals 1–11  
Owner access: required

## Scope

1. Build with the `internal-apk` EAS profile against `dananeh-staging`.
2. Do not sign off a development/debug build as the beta artifact.
3. Download the APK, calculate SHA-256, and record build metadata.
4. Install from the artifact URL on a clean device without Metro, USB, or a development server.
5. Execute the full `docs/internal-beta.md` checklist plus Goal 10's automated suite.
6. Add Privacy Policy, Terms of Use, support/contact, version/build information, and required account-deletion disclosures before public distribution.
7. Update release documentation so status and known issues are factual.

## Final acceptance criteria

- EAS build completes for profile `internal-apk` with staging package identity.
- APK installs and cold-starts independently.
- Guest onboarding, bundled offline seed, online remote catalogue, verified download, offline relaunch, signup/link, sign-in, password reset, reminders, reporting, sync, and deletion pass.
- No mock fixture, emulator host, old Firebase project ID, debug menu, Expo starter branding, or development dependency is user-visible.
- CI is green on the exact commit built.
- The release record contains:
   - commit SHA;
   - EAS build ID and build number;
   - artifact URL;
   - APK SHA-256;
   - build time;
   - backend/project ID;
   - tested device/Android versions;
   - known issues and rollback decision.
- A second person can install and complete the critical path using only the release notes.

## Evidence to provide

- EAS build URL and sanitized resolved configuration.
- APK checksum.
- Completed internal-beta checklist.
- Device screenshots/recording and final Go/No-Go decision.

---

# Final definition of done

Dananeh is ready for an internal Android beta only when all conditions below are true:

- All mandatory local and CI checks are green with no suppressed failures.
- The app uses a clean Dananeh staging backend with required services deployed.
- A signed staging APK exists and runs without Metro or a computer.
- Authentication, remote content, offline behavior, sync, reporting, notifications, and deletion are verified on-device.
- Security rules and callable boundaries have emulator allow/deny coverage.
- Release diagnostics allow operators to detect failures without collecting private learning content.
- Branding contains no Expo starter residue or missing launch assets.
- Documentation reports actual evidence, not intended architecture.

Until then, use **No-Go** for an external beta and **development-only** for the current repository state.
