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
- **A wrong receipt does nothing** and reveals nothing.
- **The device is wiped only on a terminal `done`.** A partial failure leaves
  the reader signed in and told.
- **A fresh anonymous identity afterwards**, falling back to a device-local one
  if sign-in fails — likely right after a deletion, when the request that just
  succeeded may have been the last to get through.

`deletionJobs` is unreadable by clients, including admins: it holds the receipt,
which is a capability. Status comes from `myAccountDeletionStatus`, which
requires the receipt and answers with a state and nothing else.

## If a reader says deletion did not work

1. Ask whether the app still shows them signed in. If it does, the server did
   not reach `done` — the deletion is safe to retry from the app.
2. Otherwise the job is finished or resumable; the device resumes it at launch.
3. `deletionJobs/{uid}` (server-side, via console) shows `state` and the steps
   that completed. There is no personal data in it.
