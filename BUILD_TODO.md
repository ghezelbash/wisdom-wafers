# Dananeh build order

Two tracks. The **design handoff** (`design_handoff_dananeh/README.md`) built the
product surface; it is complete. The **technical blueprint**
(`DANANEH_PRODUCT_TECHNICAL_BLUEPRINT.md`) covers everything behind it —
identity, a server-authoritative data layer, publishing, delivery — and is in
progress.

---

# Track 2 · Platform (blueprint)

Goal order adjusted for what the first track already built; the reasoning is in
`docs/adr/`.

## A · Foundation: workspaces, content schema, tests, ADRs — done

- [x] npm workspaces; `packages/content-schema` shared by app, pipeline and CMS
- [x] Zod schemas for 11 block types, seed, bundle, topic, path, progress event
- [x] Strict parsing for the publish gate, lenient parsing for the client
- [x] Canonical serialization + pure-TS SHA-256 for bundle checksums
- [x] `jest-expo` harness; suites for search normalisation, scheduler, grading,
      Jalali dates, schema parsing, fixture validity, registry fallback
- [x] Eight ADRs; `app.config.ts` with per-variant identity; zero lint errors

## Local full stack — done (release goal 2)

- [x] `npm run emulators` starts **Auth, Firestore, Storage and Functions**,
      building the functions first; `emulators:lite` keeps the fast subset the
      Node suites use
- [x] The seeder produces a *usable* environment: four accounts including an
      ordinary reader, `appConfig/public` with the gate open, the three launch
      seeds published **through the real pipeline** with their revisions,
      manifests, checksums and Storage bundles, topics, paths, and two drafts —
      one authored by an admin, so the self-approval rule can be reached at all
- [x] Emulator mode addresses the emulator's own bucket. It kept the name from
      `.env`, so it was talking to a bucket named after a real project — which
      the emulator serves anyway, hiding the mistake
- [x] `npm run smoke:local`: 18 checks over HTTP the way the app does — sign-in,
      catalogue, bundle download with checksum, three callables, idempotency,
      the PII guard, and the whole editorial workflow including both refusal
      paths
- [x] `publishApproved` maps `PublishError` instead of answering `INTERNAL`;
      an approved draft at an already-published revision is an ordinary
      editorial condition, not a broken server
- [x] A real README with one canonical startup sequence

## C · Firebase shape and security — done

*Taken before B: identity needs a backend to verify against, and the emulator is
the safe one.*

- [x] `firebase.json`, project aliases, emulator suite, JDK via Homebrew
- [x] Firestore + Storage rules (blueprint §15), deny by default
- [x] Composite indexes for the feed and catalogue queries
- [x] 48 allow/deny rules tests against the emulator — they caught a real bug
      (reading through a null `resource` on create is an evaluation error, not a
      false)
- [x] **Tightened for release goal 7** (ADR 22): `appConfig` is public for the
      one `public` document rather than across the collection; device/push-token
      documents carry a key allow-list with types and sizes instead of
      `read, write: if owner`; profile *values* are validated, not only their key
      names; and an editor must own a draft to edit it, with an admin override
      that is written down
- [x] **Progress has one writer.** Client writes to `users/{uid}/progress` are
      refused — every change already goes through `ingestProgress`, which derives
      the percent, the resume position and the schedule; a second writer could
      only contradict it

## B · Identity — done

- [x] Firebase anonymous auth on first launch — a stable uid before any data
- [x] **Account linking**, so guest progress carries over instead of being
      replaced by a parallel account, proven end to end against the emulator
- [x] `authStateReady()` before reading `currentUser` — without it a restored
      session is invisible, which minted duplicate anonymous accounts and sent
      the upgrade down the create path
- [x] Local identity fallback so the app works with no backend at all
- [x] Typed, localized auth errors; no screen imports Firebase
- [x] **Recovery from local-only** (ADR 13): the device-local fallback is a
      state the app climbs out of, on reconnect and before any credential
      action — it used to pin the app to the local repository until restart
- [x] **Identity migration**: `migrateIdentity` rewrites the uid on every queued
      envelope and revives items that dead-lettered as `uid-mismatch`
- [x] Signing into an existing account merges this device's completions into it,
      with ids derived from the fact so a second sign-in cannot double-count
- [x] `emailInUse` on sign-up is a fork — "sign in to that account" — not a
      red error
- [x] `users/{uid}` reads and preference/bookmark writes (`AccountSync`), and a
      deterministic conflict policy in `src/domain/account/sync.ts` (ADR 14)
- [x] **Delete account for real**: recent-sign-in requirement, a resumable
      server job over subcollections, uid-keyed documents, Storage, push tokens
      and the Auth record; reports anonymised rather than destroyed; the device
      wipes only after the server reports `done`, then starts a fresh anonymous
      reader
- [x] **A receipt closes the window after Auth deletion** (release goal 5).
      Auth goes last, so a lost response left a device that could neither
      resume nor ask — it had to guess whether its data was gone. The receipt
      is minted before anything is destroyed and outlives the account
- [x] Reauthentication happens **in the flow**: the reader types their password
      on the delete screen instead of being sent away to sign out and back in
- [x] An interrupted deletion is resumed at launch
- [x] A fresh anonymous identity afterwards, falling back to a device-local one
      if sign-in fails — likely right after a deletion
- [x] Export covers the account as well as the device, so it matches what
      deletion is about to destroy
- [x] `deletionJobs` is unreadable by everyone including admins: it holds the
      receipt, which is a capability
- [x] **Preferences and bookmarks are pushed on change** (ADR 19). Both had a
      transport and no caller, so a second device restored progress and then
      showed the default pace and an empty garden
- [x] Review state is derived server-side from the `reviewed` event, using the
      same interval table the app states on the button — and
      `users/{uid}/reviews` is now `write: if false`
- [x] The resume position rides on `block_viewed`, queued once per *furthest*
      block, and only ever advances within a revision
- [x] An un-save is a document (`saved: false`), not a deletion — an absent row
      says nothing to a device that never saw it exist, and delete is refused
- [x] A failed identity migration is recorded durably and retried on relaunch
      and reconnect instead of being swallowed before the uid switches

## D · Content pipeline — done

- [x] `functions/` (2nd gen, TypeScript) sharing `@dananeh/content-schema`
- [x] `publishSeed`: validate → compile → checksum → **reserve** → upload with a
      no-overwrite precondition → transactional pointer (ADR 21). Immutability
      now survives concurrency: the old check-then-write let two publishes both
      pass and produced one artifact holding the loser's bytes under the
      winner's checksum
- [x] Rollback restores the whole catalogue summary, not only the pointer and
      manifest — title, objective, topic, difficulty, duration and locale
- [x] Editorial transitions and their audit entries commit as one operation;
      publishing claims the draft (`approved → publishing → published`) so two
      editors cannot both run the pipeline
- [x] Drafts are created through `createContentDraft` / `startCorrection`
      rather than by inserting a document into Firestore by hand
- [x] `rollbackSeed`: the pointer moves, artifacts are never deleted
- [x] `ingestProgressEvents`: idempotent on event id, monotonic completion,
      daily buckets in the reader's own timezone, aggregates written server-side
- [x] `RemoteContentSource`: catalogue from Firestore, bundles from Storage,
      **checksum verified before anything renders**
- [x] `SeedManifest` in `packages/content-schema` — `seedId`, `revision`,
      `storagePath`, `checksum`, `bytes`, `schemaVersion`, `publishedAt` —
      written by `publishSeed` and restored by `rollbackSeed`, so no field can
      drift out of step with the artifact it describes (ADR 11)
- [x] `BundleStorage`: the object path is resolved through the Storage SDK
      (`getDownloadURL`), never handed to `fetch` as if it were a URL; a
      manifest carrying a scheme, a leading slash or `..` is refused twice —
      at the schema and again at the transport
- [x] `EXPO_PUBLIC_CONTENT_SOURCE=remote` dual-read with fallback to what is on
      the device; the bundled seed always survives hydration
- [x] A refresh that fails changes nothing — not the catalogue, not the sync
      point. `lastSyncedAt` moves only with the commit that justifies it
- [x] Outbox drains through the `ingestProgress` callable; the network layer is
      lazily imported so it stays out of the startup path
- [x] `submitReport` callable: reports are idempotent on the device-generated
      id, and `firestore.rules` refuses every client write to `reports` — an
      updatable report is one a reporter could rewrite after triage
- [x] Emulator tests covering publish, rollback, ingestion, the publish → read
      round trip, and **publish → Storage → catalogue → download → relaunch
      offline** against the real Storage emulator (`content-delivery.test.ts`)

## E · Real offline — done

- [x] `expo-sqlite` schema: catalog_seed, download, progress_local, outbox,
      search_token, schema_meta
- [x] Forward-only migrations with an N-1 → N test that keeps existing rows
- [x] One-time migration of a device's key-value progress into SQLite
- [x] Bundle download to the app's own directory, **checksum verified before
      the write and again on read**; corrupt means redownload, never render.
      `DeviceCatalog` is the one path to catalogue state, with SQLite on device
      and a key-value document elsewhere behind the same API; the download
      commit is one transaction and the file is removed if it fails
- [x] Deleting a download deletes the row *and* the file, and it stays deleted
      across a relaunch
- [x] Outbox: exponential backoff with full jitter, retry ceiling, dead letters
      kept rather than discarded
- [x] Conflict policy from §8.3 — monotonic completion, furthest position within
      a revision, newer revision wins, last-intent bookmark
- [x] 24 tests against a real SQLite database (Node's built-in driver behind the
      same interface the device uses)
- [x] **One outbox** (ADR 12): `SqlOutboxStore` on device, key-value elsewhere,
      behind `src/lib/outbox.ts`. The parallel AsyncStorage queue is gone
- [x] Per-item acknowledgement — `applied` / `duplicate` delete, `rejected`
      dead-letters with its reason, a thrown error retries with backoff, and an
      unrecognised answer is never read as delivery
- [x] Envelopes built and schema-validated in `src/domain/progress/events.ts`
      before they are queued; completions, reviews and reports all go through it
- [x] A boundary test: nothing under `app/`, `components/`, `features/` or
      `hooks/` may import AsyncStorage, expo-sqlite, expo-file-system or
      `@/data/local/`
- [ ] SQLite runs on device only; web keeps the key-value backend. The SQL
      itself is exercised against Node's built-in SQLite, but not on a device

## F · Notifications — done

- [x] `expo-notifications`; permission requested only from the screen that
      states the frequency cap, after the first completion
- [x] One daily reminder, replaced rather than added — the cap by construction
- [x] Quiet hours honoured by moving a chosen time, not dropping the reminder
- [x] Notification taps route into the app, including the tap that launched it
- [x] Settings reflect a real OS-level denial and spell out the path
- [ ] Scheduling is native-only; not exercised in this environment

## G · Analytics and observability — done

- [x] Typed event map over the §11 taxonomy; a name cannot be invented at a
      call site
- [x] **PII guard refuses rather than sanitises** — forbidden key names, values
      that look like addresses, URLs or free text, and non-scalars
- [x] Events wired into the real funnel: onboarding, seed start, block, answer,
      completion, search shape, report category
- [x] Error context (route, seed, revision) attached to the fatal state
- [x] Feature flags with safe in-binary defaults; remote values can only narrow,
      and the AI tutor stays off — **now actually enforced**: a remote boolean
      may go `true → false`, never the reverse. It previously could switch a
      shipped-off feature on
- [x] **The flags reach the features** (ADR 20). `isEnabled`/`getFlags` had zero
      callers, so every kill switch was decoration. `RemoteConfigContext` is the
      single runtime source; `platform/config` mirrors it for code outside the
      tree
- [x] A disabled feature is unreachable, not merely unadvertised: route
      requirements, notification-payload checks, and a `FeatureGate` that makes
      the screen refuse for itself when the flag flips while it is open
- [x] Nothing mounts until the first config fetch settles — the catalogue was
      starting a remote refresh under the shipped flags and beating maintenance
      to it (six Storage requests before, zero after), bounded by a timeout so
      a slow config service cannot stop the app opening
- [x] **A forced update has no way past it.** Both gate states offered "go to
      the garden", and the handler declared the gate open — so a build the
      server had refused could open the whole app with one press
- [x] Maintenance is a scoped exception expressed as flags, not an open gate
- [x] `seed:emulator --gate=maintenance|update-required --off=<flags>` makes
      both states reachable locally instead of by hand-editing Firestore
- [x] **Remote config is live**: `appConfig/public` drives maintenance, minimum
      version and flags, and every path fails open
- [x] **Maintenance and forced-update states** exist and can be triggered — the
      handoff wrote the copy and nothing could reach it before
- [x] Analytics and crash reports ship through the outbox to
      `recordTelemetryBatch`; a crash that killed the app offline still arrives
- [x] **Every declared event is actually sent** (ADR 23, release goal 8). Nine of
      sixteen had no call site — impressions, all three download events, review
      completion, both notification events, `onboarding_started` and
      `account_linked`. Each would have read as a confident zero on a dashboard.
      `docs/event-coverage.md` is generated, and `tests/static/event-coverage.test.ts`
      fails when a declared event has no caller
- [x] `onboarding_completed.duration_ms` was hard-coded to zero; the start
      instant is stored with the session, so it survives a restart
- [x] **Correlation**: a session id ties a crash to the events around it, an
      install id answers "one device or many". Neither is the uid, and both are
      wiped with the device's data on account deletion
- [x] **Analytics may wait; progress may not.** The flush is per endpoint, so a
      throttled or failing telemetry batch no longer holds up the completions
      queued behind it
- [x] **Firestore is the crash trail, so it is operated like one**: retention
      (30 days events / 90 crashes, swept nightly in bounded batches), a daily
      `opsDigest/{day}` computed from `occurredAt` not `receivedAt`, and
      `npm run diagnose` — sign-in, a callable answering, a callable still
      *refusing*, content with an artifact and checksum, and a synthetic crash
      read back with its version, route and environment, then deleted
- [x] Dashboards, thresholds, retention and incident ownership written down in
      `docs/runbooks/observability.md`
- [x] The PII guard runs on the client *and* the server; a crash message is
      redacted rather than refused, because a refused crash is an invisible one
- [x] **Public callables are guarded** (ADR 22): one table of per-callable body,
      batch and rate limits, checked before the handler in cost order. The rate
      limit is a Firestore transaction, so two simultaneous requests cannot both
      pass a read-then-write
- [x] **A throttle costs a reader nothing.** `resource-exhausted` carries
      `retryAfterSeconds`, the transport raises `ThrottledError`, and the queue
      defers the item without spending an attempt — otherwise eight throttles
      would have dead-lettered a completed seed
- [x] **App Check coverage is measured** while enforcement stays off: a sharded
      daily counter of verified vs unverified calls, so the rollout is a decision
      with a number behind it
- [ ] Crashlytics, Performance Monitoring and App Check *enforcement* need native
      modules and land with the RNFirebase migration. The JS SDK attests with
      reCAPTCHA, which has no DOM on device — `src/data/remote/app-check.ts`
      wires web and reports `unsupported-platform` on native rather than
      pretending. `docs/runbooks/observability.md` has the monitor → enforce order

## H · Recommendation v1 — done

- [x] The explainable score from §9.3 with hard filters
- [x] Diversity constraint, saturation penalty, ≥15% exploration
- [x] Reason codes wired to the real ranker; ranking unit tests

## I · CMS admin — done

- [x] React admin (`admin/`, Vite) with custom-claim roles read from the token
- [x] Draft → in review → approved → published, with changes-requested looping
      back; enforced in Functions, where authorship is visible
- [x] **An editor cannot approve their own draft** — refused server-side, and
      the button is not offered either
- [x] Submitting runs the publish gate early, so review is about whether the
      content is *right*, not whether it is complete
- [x] Live validation while editing, plus an RTL preview of the real blocks
- [x] Audit trail of every transition; rollback for admins
- [x] **Editorial writes are server-only** (ADR 15): a client may write content
      and nothing else. `state`, `authorUid`, approval and publication fields
      are unwritable, a draft in review is frozen, and `cmsReviews` is
      `write: if false` — a reviewer who can write the audit trail can forge an
      approval on their own draft
- [x] Rules tests assert the deny side of each: transitions by every role,
      forged authorship and approvals, editing a frozen draft, writing or
      deleting an audit row, and published seeds/revisions being immutable to
      editors, reviewers and admins alike
- [x] `tests/static/secrets.test.ts`: nothing credential-shaped is tracked, and
      Firebase config is read from the environment rather than a literal
- [x] Verified end to end against the emulator: editor submits → reviewer
      approves → editor publishes → `seeds/{id}` is published at that revision

## J · Native platform

- [x] **Android 13+ notifications** (ADR 17): `POST_NOTIFICATIONS` declared —
      without it the ask silently no-ops — and the channel is created before the
      ask, with a Persian name, because that is what system settings shows
- [x] **Deep links are an allow-list**, matched whole. The previous
      `startsWith('/')` accepted `//evil.example/x`, a protocol-relative URL
- [x] `allowBackup: false`: Android auto-backup would have copied reflections
      the app calls "on this device only" into the reader's Google account
- [x] `npm run check:android` reads the generated manifest, resources and gradle
      — icons, monochrome layer, light/dark splash, RTL, permissions, backup,
      scheme and package. It found both defects above on its first run
- [x] Nine Maestro flows in `.maestro/`, ordered, with `scripts/smoke-android.sh`
      toggling airplane mode around the offline one
- [x] `docs/runbooks/native-qa.md`: what is automated, and the nine things only
      a device can answer
- [ ] React Native Firebase, development builds, EAS
- [ ] App Check: monitor → staging enforce → phased production
- [ ] Native Analytics, Crashlytics, Performance

## K · CI/CD and release — done

- [x] GitHub Actions: static checks, unit tests, emulator suite on a JDK, a web
      export (a Metro failure typechecks fine), and Expo Doctor as a warning
- [x] EAS profiles and channels mapped to the app variants; `runtimeVersion`
      follows `appVersion` so an update cannot land on mismatched native code
- [x] **Environment validation** (ADR 16): `config/env.js` is the single set of
      rules, run by `app.config.ts` at build time and at startup. A staging or
      production build with missing, placeholder or mismatched configuration
      **fails** instead of falling back to a device-local identity
- [x] `EXPO_PUBLIC_ENV_NAME` must equal `APP_VARIANT` — the check that stops a
      staging build shipping with production's Firebase project
- [x] `internal-apk` profile: Android APK, staging backend, internal
      distribution, `preview` channel
- [x] `npm run check:config` in CI: identity per variant, and six
      misconfigurations asserted to fail
- [x] CI builds Android natively (prebuild + `assembleDebug`) — a config-plugin
      change typechecks fine and then fails on a device
- [x] `.env.example` committed; `docs/runbooks/environments.md` with the
      one-time human setup and exactly what is needed from the project owner
- [x] Release, incident and backup/restore runbooks in `docs/runbooks/`
- [x] `npm run check:config` and an Android prebuild + `assembleDebug` +
      `check:android` are CI gates
- [x] **Expo Doctor is a hard gate** (21/21). `expo install --fix` brought
      AsyncStorage back to `2.2.0` and four other packages to the versions SDK
      57 expects; nothing in CI is behind `continue-on-error` any more
- [x] `lint` runs with `--max-warnings 0` — a warning that never fails a build
      is a warning nobody fixes
- [x] The Node suites map `expo/virtual/env`, which `babel-preset-expo` injects
      for every `process.env.EXPO_PUBLIC_*` read; without it any app module
      touching one failed to *parse* rather than fail an assertion
- [x] Client Firestore instances are `terminate()`d in teardown. `deleteApp`
      alone left the gRPC channel open and Jest never exited
- [x] `docs/internal-beta.md`: release notes, known issues and a 20-step
      install-and-test checklist for a clean device
- [ ] **The build itself.** Everything in the repository is done and green; EAS
      login, the project link, the Firebase projects and the signing key need
      the project owner. The exact list is at the end of
      `docs/runbooks/environments.md`
- [ ] Store listing, privacy answers and the first phased rollout need real
      credentials and a first release

---

# Track 1 · Product surface (design handoff) — complete

## 1 · Tokens and type primitives — done

- [x] `src/constants/theme.ts`: semantic token set, light/dark pair per token,
      four palette corrections preserved
- [x] Type scale, spacing (+12/20/48), radius 8/16/24/32, elevation, motion,
      breakpoints, `BottomTabInset` 76, `MaxContentWidth` 720
- [x] `global.css` + `tailwind.config.js`: tokens as CSS custom properties that
      swap on `prefers-color-scheme`; violet removed
- [x] `Text` primitive with `variant` / `color` / `ltr` / `mono`
- [x] `MetaDot` separator and `toFaDigits` formatter
- [x] Fonts pruned to 400/600/700/800

## 2 · Guest-first routing — done

- [x] Login wall removed; `Stack.Protected` gates on onboarding, not an account
- [x] Guest session in AsyncStorage (`SessionContext`)
- [x] Onboarding screens 1–4 (promise, interests, pace, first-seed handoff)
- [x] `auth` as an offer reachable from the promise and Profile
- [x] Profile: account offer, never a wall
- [x] Locale bootstrap owns direction; Persian default
- [x] Vector icon set + custom 76pt tab bar; retired PNG tab icons deleted

## 3 · Block registry + player — done

- [x] `src/models/seed.ts`: 11 block types, `schemaVersion`, `revision`, sources
- [x] Bundled first seed authored from the handoff (all block types, 3 sources)
- [x] Player chrome: 44pt close, truncated title, segmented progress with its
      text equivalent, save, more
- [x] Block registry keyed by `block.type` with a named fallback that never throws
- [x] `richText`, `image`, `quote`, `callout`, `summary`
- [x] `multipleChoice`, `multiSelect` (partial credit), `trueFalse`
- [x] `ordering` and `matchPairs`, each with a non-drag path
- [x] `reflection` — optional, private, never scored
- [x] Answer feedback: indicator + border + text badge before colour; retry with
      no shame copy; wrong options de-emphasised, never hidden
- [x] Sources sheet and report sheet in one stack
- [x] Autosave on every block change; closing is free
- [x] Completion, notification ask, account offer (screens 29–31)

## 4 · Offline catalog and outbox — done

- [x] `ContentRepository` interface; the launch catalogue (`LAUNCH_SEEDS`) is
      three authored, sourced, **strictly publishable** Persian seeds, and test
      fixtures live in `src/data/__fixtures__/` where a reader cannot reach them
- [x] `generatedData`, `mockLessons`, `store.ts`, `models/lesson.ts`,
      `lessonToSeed` and `scripts/generateLessons.js` removed — eleven
      source-less faker lessons that real readers saw whenever a fetch failed
- [x] Cached / stale / queued / missing states with a designed appearance
- [x] Download manager with real byte progress; corrupt-with-retry
- [x] Outbox for queued writes (completions, reports)
- [x] Offline banner stating when data was last true
- [x] Storage manager with a real quota bar
- [x] Player states a missing asset, its resume point, and offers a skip

## 5 · Home, Explore, search — done

- [x] `SeedCard` with its six variants and reason codes
- [x] Home: continue card, growth + due strip, hero seed, four finite rails, explicit end
- [x] Home states: light, dark, offline-cached, loading skeleton
- [x] Explore: topic grid, paths rail, filters, topic detail, path detail
- [x] Search as a pushed screen with shared normalisation, offline, match reasons
- [x] No-result recovery screen

## 6 · Review and growth — done

- [x] Garden tab: five segments in one screen with a filter
- [x] Weekly growth with one grace day, explained in words
- [x] Review session (آبیاری): due queue, covered answer, confidence separate
      from correctness, stated intervals
- [x] Review results: what changed and the next interval per item
- [x] Scheduler wiring: recall prompts, intervals 14/7/3/1, first ask on day 3

## Cross-cutting, tracked as each step touches it

- [x] `SystemState` component: every failure names what still works and offers a
      second action that is not "retry"; identifiers are LTR-isolated monospace
- [x] Reachable states: offline banner, missing asset, empty segments, no-result,
      seed-not-found, fatal (real `ErrorBoundary`), notification permission denied
- [x] Maintenance and forced-update states, driven by `appConfig/public`
- [x] Settings screens: notifications with the cap as content, delete account
      with an export offered first
- [x] LTR proof under `en`: layout mirrors natively, Gregorian dates, Latin
      digits, type stack falls back to the system face
