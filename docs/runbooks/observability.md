# Observability and App Check

## What exists now, and what needs a native build

| | today | after the RNFirebase migration |
|---|---|---|
| Analytics events | `recordTelemetryBatch` → `telemetryEvents`, through the outbox | Firebase Analytics, native |
| Crash reports | `recordTelemetryBatch` → `crashReports`, through the outbox | Crashlytics, with native stacks |
| Performance | — | Performance Monitoring, native traces |
| App Check | **measured**, not enforced; web attests, native cannot | Play Integrity, monitor → enforce |
| Feature flags, maintenance, minimum version | `appConfig/public`, live | unchanged |

The seams are `AnalyticsSink` and `CrashSink`. Replacing the implementation is
a change in `src/platform/telemetry-sink.ts` and nowhere else — no call site
moves. Crashlytics, Performance and App Check all need native modules, so they
land with the development-build migration (`docs/runbooks/native-migration.md`),
not before. **Nothing here pretends they are already on.**

## The decision for the staging APK

**Crashlytics is not in the staging build.** It needs React Native Firebase,
which needs the native migration, and shipping the internal beta is not the
moment to do that. The staging APK reports crashes into Firestore through
`recordTelemetryBatch`, and that path is treated as a real system rather than a
placeholder — because for the duration of the beta it *is* the crash trail.

That means three things exist that a placeholder would not have:

| | where | tested by |
|---|---|---|
| Retention | `sweepTelemetry`, nightly 02:00 Tehran | `tests/integration/telemetry-retention.test.ts` |
| A daily figure | `dailyOpsDigest` → `opsDigest/{day}` | same |
| A regression check | `npm run diagnose` | run before and after each release |

Events are kept **30 days** and crash reports **90** (`RETENTION_DAYS`). A
collection nobody deletes grows without limit and turns a modest privacy promise
into a permanent record of what every reader did.

## Event coverage

`docs/event-coverage.md` maps every declared event to the file that sends it,
and is generated (`npm run docs:events`) rather than maintained. Nine of the
sixteen events were previously declared and never called — impressions, all
three download events, review completion, both notification events and the
account link — so any dashboard reading them would have shown a confident zero.
`event-coverage.test.ts` now fails if a declared event has no call site.

Every event and every crash also carries a **session id** and an **install id**
(`src/platform/analytics/correlation.ts`) alongside the version and environment.
The session id is what ties a crash to the events that led to it; the install id
answers "one device or many", which is the difference between a crash worth
stopping a release for and one that is not. Neither is the uid, and both are
destroyed with the rest of the device's data on account deletion.

## Dashboards, thresholds, and who is called

The dashboard is `opsDigest/{day}`, one document per day, admin-readable. Read
it with the Firebase console or `npm run diagnose`.

| signal | field | look into it at | stop the rollout at |
|---|---|---|---|
| Fatal crashes | `fatalCrashes` | ≥ 1 on a staging build | ≥ 3, or any fatal on ≥ 2 sessions |
| Crash breadth | `affectedSessions` | ≥ 3 sessions in a day | ≥ 10, or > 5% of sessions |
| One dominant crash | `topMessages[0].count` | ≥ 5 with one message | ≥ 20 |
| Funnel collapse | `eventCounts.seed_started` | drops > 50% day over day | drops to 0 with events > 0 |
| Delivery | `events` = 0 while testers are active | any day | two consecutive days |
| Callable refusals | `rate-limited` in the function logs | any from a non-synthetic caller | sustained |

These are beta thresholds for tens of testers, not production SLOs; they are
counts because a rate over a handful of sessions is noise.

**Ownership.** During the internal beta there is one operator — the repository
owner — and the procedure is: run `npm run diagnose` against staging, read
`opsDigest` for the day, and if a threshold is crossed, roll the content pointer
back (`docs/runbooks/`), disable the feature with a flag in `appConfig/public`,
or pull the build. A crash that cannot be reproduced from the digest is a
request for a device log, not a guess.

**Before every release**, and after: `npm run diagnose`. It signs in, calls a
callable, checks that a callable still *refuses* what it should, verifies that
published content has an artifact and a checksum, and sends a synthetic crash
that it then reads back with its version, route and environment — then deletes
it, so it is never mistaken for a real one. A green run means a later silence
in `crashReports` is good news rather than a broken pipeline.

## Why telemetry goes through the outbox

A crash that killed the app offline is the one most worth having. Queuing it
means it is delivered when the connection returns, and the server's per-item
acknowledgement decides whether it leaves the queue — the same contract as a
completion.

**Analytics may wait; a reader's progress may not.** They share the queue, so
the flush is per endpoint: a throttled or failing telemetry batch defers only
the items bound for `recordTelemetryBatch`, and completions behind it keep
draining. This is asserted directly — see "keeps draining other endpoints while
one is throttled" in `src/lib/__tests__/outbox.test.ts`.

## The PII guard, twice

`track()` **refuses** an event with unsafe parameters rather than sanitising it;
sanitising invites "close enough". `recordTelemetry` refuses again, because a
client is not a trust boundary — an old build still in the field can send
whatever it likes.

Refused: any parameter whose *name* matches
`email|name|query|text|title|reflection|answer_text|token|phone|address`, any
non-scalar, and any string over 120 characters. A search is recorded as
`normalized_length` and `result_count`, never as words.

A **crash** cannot be refused — then the crash is invisible — so its message and
stack are redacted instead, visibly: emails, tokens, URLs, long digit runs and
any run of Persian prose become `«email»`, `«token»`, `«url»`, `«digits»`,
`«text»`.

## Proving it works, in staging

```bash
# 1 · The funnel. Complete a seed in the staging build, then:
npx firebase firestore:query telemetryEvents --project dananeh-staging \
  --limit 20 --order-by receivedAt

# Expect: onboarding_completed → seed_started → seed_completed.

# 2 · A crash. From a non-production build only:
#     forceTestCrash() from src/platform/crash.ts, wired to a debug affordance.
npx firebase firestore:query crashReports --project dananeh-staging --limit 5
```

The report must carry `route`, `seed_id` and `revision` and **no** email, URL or
Persian prose. `forceTestCrash` is a no-op in production by construction:
verifying crash reporting by waiting for a real crash means finding out it was
broken at the worst possible moment.

## Maintenance and minimum version

One document, `appConfig/public`, world-readable and server-written:

```json
{
  "maintenance": false,
  "maintenanceMessage": "به‌روزرسانی محتوا",
  "maintenanceUntil": "۱۵:۰۰",
  "minimumVersion": "1.0.0",
  "flags": { "downloadsEnabled": true }
}
```

Everything **fails open**. Unreachable, absent or malformed leaves the app
exactly as it shipped. `maintenance` must be the boolean `true` — `"true"`, `1`
and `"yes"` are typos, not instructions. A `minimumVersion` that does not parse
compares as `0.0.0` and lets everyone through.

**Flags can only narrow.** A boolean may go `true → false`, never the reverse.
Turning a feature on is a release, not a config change — and recovering from a
kill switch is a restart, which restores the shipped default rather than
trusting a second remote value that could itself be wrong.

To put the app into maintenance:

```bash
npx firebase firestore:update appConfig/public \
  --project dananeh-staging --data '{"maintenance":true,"maintenanceUntil":"۱۵:۰۰"}'
```

Readers see the maintenance state; downloaded seeds still open, which is why the
garden is offered rather than a dead end.

## The callable guard

Every public callable runs `guard()` (`functions/src/shared/guard.ts`) before
its handler: body bytes, batch length, then a per-caller rate limit. The limits
are one table, and a callable with no row gets the strict fallback rather than
none. ADR 22 has the reasoning; what matters operationally:

- A refusal is `INVALID_ARGUMENT` (`payload-too-large`, `too-many-items`) or
  `RESOURCE_EXHAUSTED` (`rate-limited`, with `retryAfterSeconds` in the error
  details).
- **A throttled client loses nothing.** The queue defers the item to the time
  the server named without spending a retry attempt. If you ever see throttling
  reported as `failed` rather than `throttled` in a flush result, that is a
  regression worth stopping for — eight of them would dead-letter a reader's
  completed seed.
- Counters live in `rateLimits/{callable}__{key}`, server-only, carrying
  `expiresAt` so a TTL policy can sweep them. A caller can neither read nor
  write its own counter.

To change a limit, change the table — not a call site.

## App Check: what is measured now

Enforcement is off. What exists is the number the decision needs:

```
appCheckCoverage/{YYYY-MM-DD}/shards/{0..9}   → { verified, unverified, byCallable }
```

Ten shards so a daily total is not one contended document; sum them with
`appCheckCoverageFor(deps, day)`. Admin-readable, written only by the server.
The write is fire-and-forget — a metric must never be the reason a reader's
completion fails to record.

**The native blocker, stated plainly.** The Firebase *JS* SDK attests with
reCAPTCHA, which needs a DOM. Android and iOS attest with Play Integrity and
DeviceCheck, which are native modules the JS SDK cannot reach. So today the web
build produces real tokens and the mobile builds cannot — `ensureAppCheck`
reports `unsupported-platform` rather than pretending. Enforcing now would
refuse every mobile request regardless of build age.

Turning it on therefore needs native attestation first (RNFirebase, or a config
plugin around the native App Check SDK), and then:

1. **Monitor** in staging. Register Play Integrity, leave enforcement off, and
   watch the verified/unverified split in `appCheckCoverage` for at least a week.
2. **Enforce in staging** once verified requests are steady — set
   `enforceAppCheck: true` on the `onCall` options in `functions/src/index.ts`.
3. **Production, monitor**, then enforce per service — Firestore first, Storage
   and Functions after.

Sideloaded APKs and emulators are unverified by definition, so an enforced
production project will refuse the internal beta build. Register a debug token
for each test device (`EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN`) before enforcing
anything.
