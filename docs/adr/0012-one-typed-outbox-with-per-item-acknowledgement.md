# 12. One typed outbox, acknowledged per item

Date: 2026-09-04 · Status: accepted · Supersedes part of ADR 4

## Context

There were two outboxes. `src/data/local/local-store.ts` had the one the
blueprint describes — SQLite, exponential backoff with jitter, a retry ceiling
and dead letters — and it was tested. The app used the other one: a JSON array
in AsyncStorage with none of that.

Worse than the duplication was what the running one did with an answer. The
seed player enqueued `{seedId, revision, completedAt}` — three of the nine
fields `ProgressEventSchema` requires — so the ingest Function rejected it. The
sender never looked at the result, the queue treated a returned promise as
delivery, and the item was deleted. Reports were worse still: the sender
filtered out everything that was not a completion and returned successfully, so
a report left the queue without being sent anywhere at all.

Both failures are the same shape: **a queue that cannot tell "the server
counted it" from "the server refused it" from "the network was down" will
silently lose data.**

## Decision

One outbox, one worker, one contract.

The queue is `OutboxStore` with two implementations — `SqlOutboxStore` on
device, `KeyValueOutboxStore` elsewhere — and `src/lib/outbox.ts` is the only
API above it. The transport returns one of three outcomes per item, and each
has exactly one behaviour:

| outcome | meaning | queue does |
|---|---|---|
| `applied` | the server recorded it | delete |
| `duplicate` | the server already had it | delete |
| `rejected(reason)` | the server never will | keep, dead, with the reason |
| *throws* | the network, not the content | retry with backoff |

`outcomeFor` refuses to read an unrecognised response as success — it throws, so
the item is retried rather than dropped. That single rule is what would have
prevented both original bugs.

Envelopes are built in `src/domain/progress/events.ts` and validated against
`ProgressEventSchema` **before** they are queued, so an incomplete event fails
at the call site instead of silently at the server.

Content reports move to a `submitReport` Function, and `firestore.rules` now
refuses every client write to `reports`. A retried report has to be idempotent
on the device-generated id, which a client-side create cannot be without also
being allowed to update — and an updatable report is one a reporter could
rewrite after triage.

## Consequences

- Migration 3 deletes legacy `completion` / `report` rows. Their payloads were
  missing required fields, so they could never have been delivered; keeping them
  would only produce dead letters for events that were never sendable.
- `seed_completed.duration_ms` is measured from when the seed was opened. It was
  hard-coded to `0`, which made the funnel unreadable.
- `ReportSheet` is typed to `ReportCategory`, so the sheet cannot offer a
  category the schema and the rules would reject.
- `clearProgress` now deletes from SQLite as well as the key-value store. It
  cleared only half, so deleted progress came back on the next launch.
- A boundary test asserts that nothing under `app/`, `components/`, `features/`
  or `hooks/` imports AsyncStorage, expo-sqlite, expo-file-system or
  `@/data/local/`. The rule held by convention and broke once already.
- **Known limit.** An event queued under a device-local uid and drained after
  the reader signs in would be rejected as `uid-mismatch`. Rewriting queued uids
  at migration time belongs with identity migration, in goal 3.
