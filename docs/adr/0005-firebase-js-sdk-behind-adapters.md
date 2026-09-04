# 5. Firebase JS SDK behind adapters; React Native Firebase deferred

Date: 2026-09-03 · Status: accepted

## Context

The blueprint's Goal 4 migrates native to React Native Firebase for Analytics,
Crashlytics, Performance and App Check, which means leaving Expo Go for
development builds. That is a large, native-only change, and every later goal
would sit behind it.

## Decision

Keep the Firebase JS SDK for now, reached only through repository interfaces —
no screen imports Firebase. Build identity, the data layer, the content pipeline
and offline sync against it. Migrate to React Native Firebase as its own goal,
service by service, once the data layer is proven.

## Consequences

- Every goal until then stays verifiable on web and in Expo Go.
- No native Analytics, Crashlytics or App Check until that goal lands; the
  analytics wrapper is written so the transport can be swapped underneath it.
- The blueprint's own advice: "UI must not import Firebase directly" is what
  makes this reversible.
