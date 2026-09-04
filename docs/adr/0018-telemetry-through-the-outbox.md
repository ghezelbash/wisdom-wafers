# 18. Telemetry through the outbox; config that fails open

Date: 2026-09-04 · Status: accepted

## Context

The event taxonomy and the PII guard were built and tested, and then logged to
the console. A release with no crash telemetry is blind: the only signal is a
reader bothering to say something, and almost nobody does.

Feature flags had the same shape — a well-tested local API with nothing
fetching. Maintenance and forced-update had copy written in the handoff and no
way to reach it, because both need a backend to declare them.

And a rule that was documented but not enforced: AGENTS.md says remote values
"can only narrow", but `applyRemoteFlags` accepted any type-correct value,
including `true`. A remote document could switch on a feature the binary shipped
with off — the AI tutor included.

## Decision

**Telemetry goes through the outbox.** A crash that killed the app offline is
the one most worth having; queuing it means it arrives when the connection does,
and the server's per-item acknowledgement decides whether it leaves the queue —
the same contract as a completion.

**The PII guard runs twice.** `track()` refuses an unsafe event rather than
sanitising it. `recordTelemetry` refuses again, because a client is not a trust
boundary: an old build still in the field can send whatever it likes.

**A crash is redacted, not refused.** Refusing it makes the crash invisible,
which defeats the purpose. An exception message is the least controlled string
in the app, so emails, tokens, URLs, long digit runs and any run of Persian
prose become visible placeholders.

**Remote config fails open, every path.** Unreachable, absent or malformed
leaves the app exactly as it shipped. `maintenance` must be the boolean `true`.
A `minimumVersion` that does not parse compares as `0.0.0` and lets everyone
through. A kill switch that bricks the app when the config service has a bad day
is worse than the problem it solves.

**Flags can only narrow, now enforced.** A boolean may go `true → false`, never
the reverse. Turning a feature on is a release, not a config change. Recovering
from a kill switch is a restart, which restores the shipped default rather than
trusting a second remote value that could itself be wrong.

## Consequences

- `telemetryEvents` and `crashReports` are server-written and admin-read. A
  client that could write there could forge a funnel or bury a crash.
- `forceTestCrash()` is a no-op in production by construction. Verifying crash
  reporting by waiting for a real crash means finding out it was broken at the
  worst possible moment.
- **Crashlytics, Performance Monitoring and App Check are not on.** All three
  need native modules, so they land with the RNFirebase migration. The seams
  are `AnalyticsSink` and `CrashSink`, and swapping them touches one file.
  `docs/runbooks/observability.md` records the App Check monitor → enforce order
  and the fact that an enforced production project will refuse a sideloaded
  beta build unless its device has a debug token.
- Maintenance and update-required render through `SystemState`, so each names
  what still works — downloaded seeds keep opening — and offers a second action
  that is not "retry".
