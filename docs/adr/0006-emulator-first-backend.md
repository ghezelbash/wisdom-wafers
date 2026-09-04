# 6. Emulator-first backend development

Date: 2026-09-03 · Status: accepted

## Context

There is one Firebase project's configuration in `.env` and no rules, indexes or
Functions. Developing against a live project risks writing to real data and
makes security rules impossible to test destructively.

## Decision

Rules, indexes and Functions are developed against the Firebase Emulator Suite,
with an allow/deny matrix run by `@firebase/rules-unit-testing` in CI. Deploying
to any real project is an explicit, human step.

## Consequences

- Requires a JDK on the development machine.
- Rules are tested against denial, not just success — the failure mode that
  matters is the one that silently allows.
- The app points at emulators in development through a single flag, so nothing
  in a screen knows the difference.
