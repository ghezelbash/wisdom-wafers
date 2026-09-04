# 19. One versioned sync contract

Date: 2026-09-05 · Status: accepted · Extends ADR 14

## Context

ADR 14 gave the merge policy a home and a set of tests. What it did not give it
was callers. Five things were declared and not connected:

- `AccountSync.pushPreferences` and `pushSaved` had **no runtime callers**, so a
  second device restored progress and then showed the default pace and an empty
  garden.
- Remote reviews were **read and thrown away** — `restoreAccount` never applied
  them, so signing in on a second device put seeds back in today's queue that
  had been answered yesterday.
- A `reviewed` event **incremented a counter** and persisted no schedule, so
  there was nothing to restore even if it had been.
- Server progress had no **resume position**: `blockIndex` existed on the device
  and nowhere else.
- Identity migration failures were **swallowed** — `.catch(() => undefined)` —
  immediately before switching uid, so work created as a guest was left
  addressed to an owner the server would refuse.

Un-saving had a sixth problem of its own: bookmarks were pushed as a *set*, and
a removal deleted the document. An absent document is indistinguishable from one
a device has never seen, so un-saving could not travel.

## Decision

**One contract, in `packages/content-schema/src/sync.ts`**, versioned and shared
by the client, the ingest Function and the rules. Every field is either
server-authoritative or mergeable with a stated rule; there is no third
category, because a field nobody has decided about is one that silently loses
data on the second device.

| document | field | owner | conflict |
|---|---|---|---|
| `users/{uid}` | preferences | client | newest `updatedAt`, **whole set** |
| `users/{uid}/progress/{seedId}` | status, completedAt | server | monotonic — never un-completes |
| | blockIndex | server | furthest within a revision |
| | revision | server | newer revision replaces outright |
| `users/{uid}/saved/{seedId}` | saved | client | newest `updatedAt`, **per seed** |
| `users/{uid}/reviews/{seedId}` | interval, dueAt | server | derived from the rating |
| | count | server | the larger — every review happened |

Three of those deserve their reasoning stated:

- **Preferences merge as a set.** They are choices made in one sitting; mixing
  two sittings produces a combination nobody picked — a pace from one device and
  a reminder time from another.
- **Bookmarks merge per seed.** Taking whole sets by timestamp would let a
  device that bookmarked something an hour ago undo an un-save from a minute
  ago.
- **A removal is a document**, `saved: false`, and deleting is refused by the
  rules. That is the only shape an un-save can travel in.

**Review state is derived server-side** from the `reviewed` event, using the
same `INTERVAL_DAYS` table the app states on the button the reader presses. Two
copies of that table would let the app promise one thing and the schedule do
another. `users/{uid}/reviews` is now `write: if false` — a client that can
write its own due date can decide never to be asked again.

**The resume position rides on the event.** `block_viewed` carries `blockIndex`,
queued once per *furthest* position rather than on every navigation: moving back
and forth inside a seed says nothing new about where a reader got to, and the
queue should carry facts. Ingestion only ever advances it within a revision,
because the queue delivers out of order and a late arrival must not drag a
reader backwards.

**A failed migration is recorded, not swallowed.** The reader is still signed in
— refusing that because a background handover failed would be worse than the
problem — but the unfinished work is written to
`dananeh.pendingMigration.v1`, surfaced as `hasPendingMigration`, and retried on
the next launch and on every reconnect. It keeps the *original* origin uid
across repeated failures, so a second failure while retrying still points at the
uid the work was created under.

## Consequences

- `SessionProvider` pushes preferences on change, debounced, because onboarding
  sets interests one tap at a time and the account only needs the answer. It
  sits above `AuthProvider` and cannot call `useIdentity`, so identity hands the
  target down via `setSessionSyncIdentity` rather than being read up.
- `onboarded`, `notificationsAsked` and `accountOfferSeen` are **not** synced:
  they are facts about *this device*, and syncing them would suppress a prompt
  on a phone that has never shown it. `notificationsEnabled` can be turned off
  remotely but never on — notifications need an OS permission this device may
  not have, and a switch saying "on" without one is a lie.
- Guests push nothing. Writing under a uid that is about to change would strand
  the data.
- `tests/integration/two-device-sync.test.ts` covers the whole matrix against
  the emulator: out-of-order position, revision replacement, duplicate delivery,
  retried reviews, un-save propagation and monotonic completion.
