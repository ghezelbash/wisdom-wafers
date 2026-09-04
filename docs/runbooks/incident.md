# Incident runbook

## Severity

- **P0** — wrong or harmful content in front of readers, data loss, or the app
  cannot open. Act now.
- **P1** — a broken flow with a workaround, or a content error that is
  misleading but not harmful. Same day.
- **P2** — everything else. Backlog.

## Content is wrong (P0)

1. `rollback` to the last good revision. Readers follow the pointer, so this
   takes effect on their next catalogue sync.
2. If no good revision exists, withdraw: set the seed's status away from
   `published`. It disappears from queries; nobody's recorded progress is
   touched.
3. Tell the editors what was wrong and why it passed the publish gate. If the
   gate could have caught it, that is the fix — not a reminder to be careful.

## The app cannot reach the backend

Expected, not exceptional. Cached seeds keep working, the outbox holds writes,
and the banner states when data was last true. Confirm that is what readers
actually see before treating it as an outage.

## Writes are being lost

Check the outbox dead-letter count. Items are kept, never discarded, so the
payloads are still there: fix the cause, then requeue. If ingestion was
double-counting instead, check event ids — deduplication is by id, and a client
generating a fresh id per retry would defeat it.

## A release is bad

See the rollback section of the release runbook. Halt the rollout first, then
decide; a rollout that continues while you investigate makes the blast radius
your problem too.

## After any P0 or P1

Write down what happened, what made it possible, and what would have caught it.
A test or a gate, not a note to be careful.
