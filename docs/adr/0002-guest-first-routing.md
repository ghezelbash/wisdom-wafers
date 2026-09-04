# 2. Guest-first routing, no login wall

Date: 2026-09-03 · Status: accepted

## Context

The original skeleton redirected to a login form on first launch. The blueprint
names this the biggest activation loss in the product, and the design gives a
guest the whole app.

## Decision

`Stack.Protected` gates on onboarding completion, not on an account. Guest state
lives in `SessionContext` (AsyncStorage). `auth` sits outside both guards and is
reached from the brand promise, from Profile, or after a completion — always as
an offer.

## Consequences

- A reader reaches the first seed without an account.
- Identity is local until Goal B adds anonymous auth, at which point the same
  session gains a stable uid and account creation must *link* rather than
  replace it — otherwise guest data is lost, which the design forbids.
