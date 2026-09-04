# 23. Telemetry is an operable system, not a taxonomy

Date: 2026-09-05

## Status

Accepted.

## Context

Sixteen events were declared. Seven were sent.

The nine that were not — `seed_impression`, all three download events,
`review_completed`, both notification events, `onboarding_started` and
`account_linked` — are not a gap in coverage. They are worse than that: every
one of them would have appeared on a dashboard as a **zero**, which reads as "it
does not happen" rather than "it is not measured". A release decision resting on
"nobody downloads anything" would have been made from an unwired call site.

`onboarding_completed.duration_ms` was hard-coded to `0`, making the one timing
question the onboarding funnel exists to answer unanswerable.

Nothing tied an event to any other event. A crash carried a version and a route
and no way to find the five events that preceded it, and no way to tell one
reader hitting a bug thirty times from thirty readers hitting it once.

And the Firestore crash path — the only crash path there is until React Native
Firebase lands — had no retention, no daily figure, and no way for an operator
to tell a healthy silence from a broken pipeline.

## Decision

### Every declared event is sent, and a test says so

`EVENT_NAMES` exists at runtime beside `EventMap`, with a type-level
exhaustiveness check that fails to compile if the two drift.
`event-coverage.test.ts` scans the source for each name's call site and fails
when one has none, and `docs/event-coverage.md` is generated from the same scan
rather than maintained by hand — evidence that is maintained by hand stops being
evidence.

`seed_impression` is the one with a caveat, and it is written down where the
number is read: it counts a card **rendered into a list the reader opened**, not
one verified to have crossed the viewport. The home and topic screens are
`ScrollView`s, which have no viewability callback; a true viewport signal means
moving five screens to `FlatList`, which is not a change to make inside a
telemetry change. The count is an upper bound, deduplicated per seed per
placement per launch, and the bias is stated rather than left to be inferred
from a ratio that never quite makes sense.

### A session id and an install id, neither of them the uid

The session id ties a crash to the events around it. The install id answers "one
device or many". Both are random, both are attached to every event and every
crash through the analytics context, and the install id is wiped with the rest
of the device's data on account deletion — an identifier that outlives what it
describes is a record nobody agreed to.

### Analytics may wait; progress may not

Telemetry and progress share one queue. The flush is therefore per endpoint: a
throttled or failing telemetry batch defers only the items bound for the same
callable, and completions behind it keep draining. Before this, one throttled
analytics batch at the front of the queue would have held up every completed
seed behind it.

### Firestore is the crash trail, so it is operated like one

Crashlytics needs native modules and is not in the staging build. That makes
`crashReports` the real crash trail for the beta, which means it needs the
properties a real one has:

- **Retention.** 30 days of events, 90 of crashes, swept nightly in bounded
  batches — a sweep that tries to delete a year at once times out and deletes
  nothing.
- **A daily figure.** `opsDigest/{day}` reduces a day to crash counts, fatals,
  affected sessions, top messages, funnel counts and the builds involved.
  Computed from `occurredAt`, not `receivedAt`: a crash that happened offline on
  the day a release went wrong and arrived two days later must be counted
  against the day it happened, or the bad day looks quiet.
- **A tested procedure.** `npm run diagnose` exercises sign-in, a callable
  answering, a callable still *refusing* what it should, content having an
  artifact and a checksum, and a synthetic crash read back with its version,
  route and environment — then deleted, so it is never mistaken for a real one.

The last one is the point. A broken crash pipeline looks exactly like a healthy
app. Proving the path works is what makes a later silence good news.

## Consequences

- Adding an event is now three edits: the map, the list, and a call site — with
  the coverage test refusing anything less. That is deliberate friction.
- Impression counts are an upper bound until the lists move to `FlatList`.
  Anything computed from them is a ratio between two upper bounds, which is
  usable for comparison and not for an absolute claim.
- Two scheduled functions and a digest document per day: small, and they are the
  first thing to remove when Crashlytics lands.
- The thresholds in the runbook are counts, not rates, because a rate over a
  handful of testers is noise. They will need rewriting for public beta.
