# 9. Anonymous-first identity, upgraded by linking

Date: 2026-09-03 · Status: accepted

## Context

The account offer promises «همین داده منتقل می‌شود، از صفر شروع نمی‌کنی». The
implementation before this goal called `createUserWithEmailAndPassword`, which
mints a *new* uid — so everything a guest had done would have been silently
orphaned the moment they took the offer.

## Decision

A reader is signed in anonymously before the first screen, so all progress is
keyed on a stable uid from the start. Creating an account calls
`linkWithCredential` on that anonymous user, keeping the uid. If Firebase is
unreachable, anonymous sign-in is disabled, or the app is not configured, a
device-local identity takes over and the app keeps working.

`ensureSignedIn` and `linkEmailPassword` both await `auth.authStateReady()`
first: the SDK restores a persisted session asynchronously, and reading
`currentUser` before that finishes reports "nobody" for a returning reader —
which mints duplicate anonymous accounts and, worse, sends the upgrade down the
create path. This was a real bug, caught by checking the emulator's account list
after driving the sign-up flow.

In development, a real project is used only with an explicit opt-in
(`EXPO_PUBLIC_ALLOW_LIVE_FIREBASE=1`) or the emulator, because anonymous
sign-in creates real accounts.

## Consequences

- Guest data survives the upgrade; proven by an emulator test that writes
  progress as a guest and reads it back after linking.
- An email already attached to another account cannot be linked; the reader is
  told to sign in to that account instead, and their device data stays local.
- Every screen reaches identity through `useIdentity()`; no screen imports
  Firebase.
