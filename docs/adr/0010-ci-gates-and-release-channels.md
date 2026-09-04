# 10. CI gates and release channels

Date: 2026-09-03 · Status: accepted

## Context

Every goal so far has been verified by hand. Without gates, the next change
silently breaks one of them — and the rules tests in particular exist to catch
things that are invisible until they are exploited.

## Decision

Five CI jobs on every pull request: static (lint + typecheck across all four
TypeScript projects), unit and component tests, the emulator suite (rules,
publish pipeline, ingestion, local store) on a JDK, a **web export**, and
Expo Doctor.

The web export is a gate, not a nicety: a Metro resolution failure — the
`expo-sqlite` wasm asset, for one — typechecks perfectly and still breaks the
build. Doctor is `continue-on-error`: a dependency the SDK has not validated is
something to see, not something to block a merge on.

EAS profiles map one-to-one onto the app variants from ADR-8, with separate
channels, and `runtimeVersion` follows `appVersion` so an over-the-air update
can never land on a binary with different native code.

## Consequences

- `@react-native-async-storage/async-storage` is on v3 where the SDK expects
  v2. It works, it predates this work, and Doctor now says so on every run
  rather than it being folklore.
- Store submission, phased rollout and the rollback runbook are still manual;
  they need real credentials and a first release to be meaningful.
