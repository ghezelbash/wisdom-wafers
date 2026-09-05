# 26. The reader's own choices are queued state

Date: 2026-09-05

## Status

Accepted. Supersedes the "push on change" half of ADR 19; the versioned sync
contract in ADR 19 stands and is now the runtime contract.

## Context

Two halves of preference sync were written and neither was connected.

**Downwards.** `AccountSync.pull` returned the account's preferences and
`mergePreferences` knew the policy — whole-object last-write-wins on
`updatedAt`. `sessionFromPreferences` existed to apply the result. Nothing
called any of them: `restoreAccount` read progress, bookmarks and reviews, and
dropped `remote.preferences` on the floor. Signing in on a second phone restored
the garden and then showed the default pace, no interests and no reminder.

**Upwards.** A preference change called Firestore directly from
`SessionContext`, and a bookmark from the seed player. Both reported failure to
the crash sink and returned. A pace chosen on a train was never sent, and
nothing afterwards — not the app, not the reader, not an operator — could tell
it had been lost. The debounce made it worse: a reader who changed a setting and
immediately backgrounded the app lost that change with no failure at all,
because the timer was cleared on unmount.

## Decision

### One queue, and no second one

Preferences and bookmarks go into the existing outbox. They get the retry,
backoff, dead-letter and per-item acknowledgement rules that are already written
and tested, they survive a force-stop, and `reassignQueuedUid` — which already
rewrites the owner on every queued envelope — means a change made before linking
an account arrives under the account, and never under someone else's.

### They are state, not events

A completion is a fact and every one of them has to arrive. A pace has exactly
one correct value, and only the last is worth sending. So these are queued by
**upsert on a deterministic id** — `prefs:{uid}` and `saved:{uid}:{seedId}` —
and dragging a slider thirty times leaves one row. Queueing thirty intermediate
values is how a queue grows without bound.

An upsert resets the retry budget and revives a dead letter, because a new
intent is not a retry of the old one.

### Written directly to the reader's own documents

Not through a callable. The rules already validate every field — `validPreferences`,
`validNotificationPreferences` and the `saved` allow-list, all tightened in goal
13 — and a callable would add a hop that could only repeat them. What changed is
not *where* the write goes; it is that the write is now owed until it succeeds.

A rule refusing the shape is a rejection that will never succeed, so it
dead-letters with the rule's name as the reason. Anything else is the network,
and retries.

### The debounce cannot swallow the last change

The current state is held in a ref and flushed when the app leaves the
foreground and when the provider unmounts. The queue itself makes this safe to
get wrong: the next change re-queues the whole current state under the same id.

### `preferencesUpdatedAt`

The session now records when its settings were last decided. Without it a
restore had nothing to weigh the account's copy against and could only overwrite
or ignore, both wrong half the time. Null for a session that predates the field,
which loses to any remote copy — correctly, since a device that never said when
it decided cannot claim to be newer.

## Consequences

- `AccountSync.pushPreferences` and `pushSaved` are unchanged and now have
  exactly one caller each: the outbox transport.
- A queued preference is one Firestore write per drain, not one per keystroke.
- The conflict policy is observable: `restoreAccount` reports `remote`, `local`
  or `none`, and a test asserts each.
- A rejected intent is visible as a dead letter with a non-PII reason. Nothing
  automatically retries it; the next change replaces it.
- Guests still queue nothing. There is no account to send to, and writing under
  a uid that is about to change would strand the data.
