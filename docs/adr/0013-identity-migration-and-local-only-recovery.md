# 13. Identity migration, and getting out of local-only

Date: 2026-09-04 · Status: accepted · Extends ADR 9

## Context

ADR 9 established anonymous-first identity and the device-local fallback that
keeps the app usable with no backend. Two things were missing.

**The fallback was a one-way door.** A single failed anonymous sign-in at launch
set `isLocalOnly`, and the provider then chose `localRepository` for the rest of
the process. `LocalIdentityRepository.signIn` throws `AuthError('network')`
unconditionally, so a reader whose first launch happened on a bad connection
could not sign in *at all* until they killed and restarted the app — long after
the connection came back.

**A uid change stranded the queue.** Every outbox envelope carries the uid it was
built with, and `ingestProgressEvents` rejects one whose uid is not the caller's.
So a completion recorded as `local-abc` and drained after Firebase issued a real
uid dead-lettered as `uid-mismatch` — recorded, queued, retried, and never
counted. ADR 12 named this as a known limit; this is the resolution.

## Decision

### Local-only is a state to climb out of, not a mode

`recoverFromLocalOnly()` retries the real repository, and is called from two
places: when connectivity returns, and — critically — before any credential
action, so a reader who launched offline can sign in the moment they are online
without restarting. Concurrent callers share one attempt. Only a
still-unreachable backend falls through to the local repository's honest
network error.

The provider no longer picks a repository at render time from `isLocalOnly`;
that binding is what made the fallback sticky.

### A uid change is an explicit migration

`migrateIdentity(from, to, { announce })` handles all three ways a uid changes:

| change | uid moves? | announce? |
|---|---|---|
| recovery — `local-…` becomes a Firebase anonymous uid | yes | no |
| upgrade — anonymous linked to an account | **no** (`linkWithCredential`) | n/a |
| sign-in — an account that already existed | yes | yes |

`transferQueue` rewrites the uid inside every queued envelope, and **revives
items that dead-lettered as `uid-mismatch`** — the reason they failed no longer
holds, and the reader's completion is still owed.

`announce` is the sign-in case, and only that one. Recovery does not announce,
because the queue already holds everything the server has not seen; announcing
would duplicate it.

### Signing into an existing account merges, and says so

The alternative was prompting mid-flow. The conflict policy from §8.3 is already
monotonic — a completion is never taken away, the furthest position wins — so a
merge cannot lose anything, and a prompt would only ask the reader to authorise
something with no downside. The auth screen states it before the action rather
than after: *"what you have read on this device is added to your account."*

`backfillCompletions` announces this device's finished seeds to the new account,
with **ids derived from the fact** — `sha256(backfill:uid:seedId:revision:type)`
— not from randomness. Signing out and back in re-announces the same ids, which
the server discards as duplicates instead of counting a second completion and
inflating a streak.

### An email that already has an account is a fork, not an error

`emailInUse` on sign-up no longer renders as a red error. The screen offers
"sign in to that account" with the same credentials, and states what happens to
what is on the device. Raw Firebase codes still never reach the UI.

## Consequences

- `LOCAL_UID_PREFIX` and `isLocalUid` are the contract between the local
  repository and migration; the prefix was already there, it is now named.
- `backfillCompletions` takes an injectable `ProgressReader`, resolved lazily by
  `require` at call time. `migrateIdentity` is exercised against a real SQLite
  database in the Node suite, where the key-value backend's platform modules do
  not exist.
- `expo-constants` is stubbed in `jest.emulator.config.js`. It reaches for
  native modules that only exist in an app process, and those suites are about
  the backend contract, not the build number.
- **Not addressed here:** the account itself does not yet sync back — signing in
  on a *second* device does not restore progress, because nothing reads
  `users/{uid}` down to the device. That is goal 4.
