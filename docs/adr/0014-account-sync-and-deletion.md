# 14. Cross-device sync, and deletion that actually deletes

Date: 2026-09-04 · Status: accepted

## Context

Two promises were being made and neither was kept.

**Sync.** The account offer says an account "adds devices". Nothing read
`users/{uid}` back down, so signing in on a second phone showed an empty garden.

**Deletion.** The delete-account screen names the account, the progress, the
reflections and the downloads, and its confirm button called
`SessionContext.reset()` and navigated away. Firebase Auth, the subcollections,
the push tokens, the Storage files and SQLite were all untouched. The reader was
shown an empty app and told their data was gone while every byte of it remained
on the server — the worst possible failure mode for this particular screen.

## Decision

### Conflict policy: deterministic, and asymmetric on purpose

`src/domain/account/sync.ts` holds the whole policy and talks to nothing. Given
both sides it returns the third state, so the same two inputs always produce the
same output whichever device ran the merge.

| what | rule | why |
|---|---|---|
| completion | monotonic — never un-completed | losing one costs a reader something they earned |
| position | furthest within a revision | re-reading is cheap, losing your place is not |
| revision | newer wins outright | the block lists differ; a position does not carry across |
| review state | from whichever side is *newer* | an interval belongs to the attempt that produced it — taking the maximum would invent a schedule neither device computed |
| review count | the larger | they happened, on however many devices |
| bookmarks | newer side's set, whole | the union is wrong: un-saving would never stick |
| preferences | newer set, whole | field-wise merging produces a combination nobody chose |

`restoreAccount` **merges, never assigns**. A device may hold a completion still
in the queue that the account has not heard about; an overwrite would erase
exactly that.

### Deletion: server first, always

`functions/src/account/delete.ts` reaches the six places a client cannot — the
subcollections, the uid-keyed documents, the reader's Storage files, the push
tokens under `devices`, the Auth record, and the job trail.

Three properties are load-bearing:

- **Recent sign-in required** (5 minutes). Erasing everything is exactly what a
  borrowed unlocked phone must not be able to do.
- **Idempotent and resumable.** Each step records itself in
  `deletionJobs/{uid}`; a run that dies is resumed by running it again, skipping
  what finished. The Auth record is deleted **last**, deliberately — while it
  exists the reader can still sign in and retry, and removing it first would
  strand a half-deleted account with no way to finish.
- **Never a false "deleted".** The device wipes only after the job reports
  `done`. A partial failure leaves the reader signed in and told, with nothing
  on the device touched.

Reports are **anonymised, not destroyed**: a report is a record about *content*
the team may still be acting on, and the reporter is the only personal thing in
it.

### Device wipe covers all three backings

`wipeDevice` clears the SQLite tables, removes the downloaded bundle files (the
manifests are read *before* the tables are emptied, since they name the files),
and removes every key-value document the app owns — including the copies the
SQLite migration deliberately left behind as a fallback.

After a successful deletion the reader gets a **fresh anonymous identity**, not
a signed-out dead end. Guest-first applies after a deletion too.

## Consequences

- `Deps` gains `deleteObjects` and `deleteAuthUser`. Every handler still takes
  everything it touches, so deletion runs identically in a Function and in a
  test.
- `deletionJobs/{uid}` is readable by its owner and by admins, writable by
  nobody — which is what lets a resumed deletion report where it got to.
- `AccountSync.pushPreferences` writes only the keys the rules allow. A write
  carrying anything else is refused *whole*, so the allow-list is enforced at
  the call site rather than discovered in production.
- **Not done here:** preferences are not yet pushed on change — the shape and
  the transport exist, but `SessionContext` does not call them. Progress and
  bookmarks do sync. The export offered before deletion is still device-only
  and does not include server data.
