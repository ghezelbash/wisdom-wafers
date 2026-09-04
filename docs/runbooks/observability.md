# Observability and App Check

## What exists now, and what needs a native build

| | today | after the RNFirebase migration |
|---|---|---|
| Analytics events | `recordTelemetryBatch` → `telemetryEvents`, through the outbox | Firebase Analytics, native |
| Crash reports | `recordTelemetryBatch` → `crashReports`, through the outbox | Crashlytics, with native stacks |
| Performance | — | Performance Monitoring, native traces |
| App Check | not enforced | Play Integrity, monitor → enforce |
| Feature flags, maintenance, minimum version | `appConfig/public`, live | unchanged |

The seams are `AnalyticsSink` and `CrashSink`. Replacing the implementation is
a change in `src/platform/telemetry-sink.ts` and nowhere else — no call site
moves. Crashlytics, Performance and App Check all need native modules, so they
land with the development-build migration (`docs/runbooks/native-migration.md`),
not before. **Nothing here pretends they are already on.**

## Why telemetry goes through the outbox

A crash that killed the app offline is the one most worth having. Queuing it
means it is delivered when the connection returns, and the server's per-item
acknowledgement decides whether it leaves the queue — the same contract as a
completion.

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

## App Check, when it lands

Order matters, and skipping a step locks real readers out:

1. **Monitor** in staging. Register Play Integrity, leave enforcement off, and
   watch the verified/unverified split for at least a week.
2. **Enforce in staging** once verified requests are steady.
3. **Production, monitor**, then enforce per service — Firestore first, Storage
   and Functions after.

Sideloaded APKs and emulators are unverified by definition, so an enforced
production project will refuse the internal beta build. Register a debug token
for each test device before enforcing anything.
