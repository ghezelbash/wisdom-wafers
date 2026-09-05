# Account deletion

## Why it is three calls, not one

The Auth record is deleted **last**, deliberately: while it exists the reader
can still sign in and retry, and removing it first would strand a half-deleted
account with no way to finish.

That ordering creates one hard window. If the response is lost *after* Auth is
deleted, the device can no longer authenticate — so it can neither resume the
job nor ask whether it finished. It would have to guess whether its data still
exists, and every possible guess is wrong some of the time: wiping on a guess
tells a reader their data is gone when it may not be; not wiping leaves them
holding data they asked to destroy.

So a **receipt** is minted before anything is destroyed, and it outlives the
account.

```
                    ┌──────────────────────────────────────────┐
                    │  reader confirms, recent sign-in proved   │
                    └────────────────────┬─────────────────────┘
                                         ▼
                       beginDeleteMyAccount   (authenticated,
                                         │     recent login required)
                       job: requested    │     ── nothing destroyed ──
                       receipt minted    ▼
                    ┌────────────────────────────────┐
                    │ receipt written to the device  │
                    └────────────────┬───────────────┘
                                     ▼
                        deleteMyAccount(receipt)
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
   response: done            response lost               step failed
        │                            │                            │
        │                   myAccountDeletionStatus       job: failed
        │                            │                    (Auth intact,
        │                   ┌────────┴────────┐            retryable)
        │                   ▼                 ▼                    │
        │              state: done      not done                   │
        │                   │                 │                    │
        │                   │      resumeDeleteMyAccount(receipt)  │
        │                   │      ── no session needed ──         │
        │                   │                 │                    │
        └───────────────────┴────────┬────────┘                    │
                                     ▼                             ▼
                            wipe device, clear receipt       tell the reader,
                            fresh anonymous identity         leave them signed in
```

A receipt still on the device at launch means the response was lost, or the app
was killed between the server finishing and the wipe. Startup resumes it.

## What is destroyed

| | |
|---|---|
| `users/{uid}/…` | progress, saved, reviews, devices (push tokens), daily, eventLog |
| `feeds/{uid}/items`, `feeds/{uid}` | the personalised feed |
| `userStats/{uid}`, `entitlements/{uid}` | aggregates |
| Storage | `users/{uid}/` and `quarantine/users/{uid}/` |
| `users/{uid}` | the profile |
| Auth | the account itself — **last** |
| Device | SQLite tables, downloaded bundles, every owned AsyncStorage key |

**Reports are anonymised, not deleted.** A report is a record about *content*
the team may still be acting on; the reporter is the only personal thing in it,
and it is replaced with `deleted`.

## Properties that are tested, not assumed

- **Recent sign-in required** (5 minutes), asked for *in the flow* — the reader
  types their password on the delete screen rather than being sent away to sign
  out and back in.
- **Every step idempotent**, skipping what already finished.
- **Nothing destroyed before the receipt exists.**
- **A wrong receipt does nothing** and reveals nothing — wrong, malformed,
  truncated, re-encoded, or valid-but-for-another-uid all get the same answer as
  "no such job".
- **The receipt is never stored**, only a digest of it.
- **The device is wiped only on a terminal `done`.** A partial failure leaves
  the reader signed in and told.
- **A fresh anonymous identity afterwards**, falling back to a device-local one
  if sign-in fails — likely right after a deletion, when the request that just
  succeeded may have been the last to get through.

`deletionJobs` is unreadable by clients, including admins. Status comes from
`myAccountDeletionStatus`, which requires the receipt and answers with a state
and nothing else.

## The receipt

**256 bits from `crypto.randomBytes`, base64url — exactly 43 characters.** The
callable boundary accepts that shape and nothing else, so the rate limit guards
a fixed-length secret rather than whatever a caller felt like sending.

**Only a digest is stored.** `deletionJobs/{uid}` holds
`receiptDigests: [sha256-hex]` and `receiptVersion`, never the bearer value. A
backup, an export or an operator with console access therefore holds something
that cannot be replayed.

A job carries **at most three** live digests. `begin` called twice cannot return
the first receipt — nothing stores it — and must not invalidate it either,
because a device already holding one is the case the receipt exists for. So it
issues another and keeps the earlier digests, oldest dropped first.

### What this replaced, and why it mattered

The first version minted the receipt from `Math.random` — not a CSPRNG — as 32
hex characters, which is 128 bits of *predictable* output, and stored the bearer
secret in plaintext beside the job. The comments described it as a 256-bit
secret. Every part of that sentence was wrong.

### Threat model

| threat | what stops it |
|---|---|
| **Guessing.** An attacker tries receipts against a uid | 256 bits of CSPRNG output, and `resumeDeleteMyAccount` is rate-limited to 10 calls a minute per claimed uid, `myAccountDeletionStatus` to 20 |
| **Theft from the database.** A backup, an export, a console reader | Only a SHA-256 digest is at rest. Nothing there can be presented as a receipt |
| **Theft from the device.** Someone with the unlocked phone | The receipt can do exactly two things, both idempotent, both scoped to one already-requested deletion of that same device's account. It cannot start a deletion — `begin` needs a recent sign-in — and it reveals nothing but how far that job got |
| **Replay against another account.** A valid receipt presented with a different uid | The digest is compared against *that uid's* job. A receipt for uid A matches nothing under uid B, and the answer is the same `null` as "no such job" |
| **Malformed or truncated input** | Rejected at the callable boundary by exact shape, before any lookup |
| **Timing.** Learning about a digest from how long a comparison took | `timingSafeEqual` on fixed-length buffers, and every stored digest is compared rather than returning on the first match |
| **Logging.** A receipt in a log line, a crash report or an error | Nothing in `functions/src/account/delete.ts` or `index.ts` logs a receipt or a request payload. The client's PII guard refuses a parameter named `token`, and a crash message is scrubbed for token-shaped runs |
| **Response loss after Auth deletion** | Unchanged, and the reason the capability exists: the device resumes or asks with the receipt it already holds |

## If a reader says deletion did not work

1. Ask whether the app still shows them signed in. If it does, the server did
   not reach `done` — the deletion is safe to retry from the app.
2. Otherwise the job is finished or resumable; the device resumes it at launch.
3. `deletionJobs/{uid}` (server-side, via console) shows `state` and the steps
   that completed. There is no personal data in it.
