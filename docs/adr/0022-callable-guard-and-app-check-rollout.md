# 22. Public callables are guarded, and progress has one writer

Date: 2026-09-05

## Status

Accepted.

## Context

Every callable validated the *contents* of a request. None of them validated
its size, and none of them limited how often it arrived. A single signed-in
account could post a fifty-megabyte array of well-formed events, or call any
endpoint as fast as it could open sockets. The batch caps that did exist — 200
for `ingestProgress`, 50 for `submitReport`, 100 for `recordTelemetryBatch` —
were written inline at three call sites, which is how they came to disagree with
each other and why nothing could state the limits as a set.

Separately, `users/{uid}/progress` was client-writable under field validation
while `ingestProgress` was described as authoritative. Both statements could not
be true.

And App Check was declared as future work with no way to decide when the future
had arrived.

## Decision

### One table of limits, checked before the handler

`functions/src/shared/guard.ts` holds `LIMITS` — body bytes, batch items, calls
per window — for every callable, with a deliberately strict fallback so a new
endpoint that forgets to add a row is not unlimited. `guard()` runs the checks
in cost order: payload size and batch length are free, so a caller flooding
oversized requests is refused without a Firestore transaction per attempt.

Body size is measured in **bytes**, not characters. Persian is two bytes per
character in UTF-8, so a limit read in UTF-16 units would have been twice as
permissive for the language the app is written in.

### A fixed-window rate limit, per caller per callable

One document per `(callable, key)` in `rateLimits`, updated in a transaction.
Fixed rather than sliding: a sliding window needs the timestamp of every call
in it, and the burst a fixed window permits at a boundary is bounded by twice
the limit, which at these numbers is nothing. The transaction is the point — a
read-then-write lets two of a caller's simultaneous requests both pass, which
the concurrency test asserts against the real emulator.

The two session-less deletion callables are keyed by the uid being *claimed*,
because by then there may be no account left to authenticate. Ten attempts a
minute is what makes guessing a 256-bit receipt impractical.

### A throttle must not cost a reader their data

This is the part that matters more than the limit itself.

The outbox dead-letters an item after `MAX_ATTEMPTS` (8) failures. Had a
throttle been reported as a failure, a device that hit the rate limit eight
times would have **deleted a reader's completed seed** — the queue having been
told the send failed when the server had actually said "wait".

So `rate-limited` is its own code, surfaced as `resource-exhausted` with
`retryAfterSeconds` in the error details. The transport raises `ThrottledError`,
and the queue *defers* the item to the time the server named without spending an
attempt, then stops the flush — everything behind it would be refused too, and
each attempt costs a round trip the server has already declined.

### Progress has exactly one writer

Client writes to `users/{uid}/progress` are refused. Every change already
travels through the outbox into `ingestProgress`, which is idempotent on event
id and derives `percent`, `blockIndex`, the completion aggregate and the review
schedule. A second writer could only contradict it: set a completion the server
never counted, or move a resume position backwards past the monotonic rule the
ingest applies — after which two devices disagree with no event to reconcile
from. Reads are unchanged.

### App Check is instrumented, not enforced

Each guarded call records whether a verified App Check token was present, into
a sharded daily counter (`appCheckCoverage/{day}/shards/{n}`, ten shards so a
daily total is not one contended document). The write is fire-and-forget: a
metric must never be the reason a reader's completion fails to record.

Enforcement stays off, and there is a second reason beyond coverage. The
Firebase **JS** SDK attests with reCAPTCHA, which needs a DOM. On Android and
iOS the providers are Play Integrity and DeviceCheck — native modules the JS
SDK cannot reach. Enforcing App Check today would refuse every mobile request
regardless of build age. `src/data/remote/app-check.ts` wires the web provider,
which works and exercises the whole path, and reports
`unsupported-platform` on native rather than pretending to attest.

## Consequences

- One extra small Firestore write per guarded call (the rate-limit counter), and
  one more for the coverage metric. At internal-beta scale this is negligible;
  the coverage counter is removed when enforcement lands. `rateLimits`
  documents carry `expiresAt` so a TTL policy or a sweep can drop them.
- A client that is throttled makes no progress until the window rolls over, by
  design, and loses nothing.
- Correcting a reader's progress is now a server operation. There is no
  client-side repair path, which is the intent.
- Turning App Check on requires native attestation first — React Native Firebase
  or a config plugin around the native App Check SDK. That is a dependency
  decision, recorded here so it is not rediscovered as a surprise during the
  rollout.
