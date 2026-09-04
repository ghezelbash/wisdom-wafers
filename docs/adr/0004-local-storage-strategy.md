# 4. AsyncStorage now, SQLite when the catalogue is real

Date: 2026-09-03 · Status: accepted

## Context

The blueprint specifies SQLite tables for the catalogue, downloads, progress and
the outbox. The app currently reads a fixture catalogue of a dozen seeds and
stores progress per seed.

## Decision

Progress, session, catalogue state and the outbox are JSON documents in
AsyncStorage behind small modules (`progress-store`, `catalog-store`, `outbox`).
SQLite arrives in Goal E together with real downloads, a normalised search index
and forward-only migrations.

## Consequences

- No query engine and no partial reads: fine for a dozen seeds, wrong for a
  thousand. The module boundary is what makes the swap contained.
- The migration to SQLite must carry existing on-device state forward; a reader
  who has completed seeds cannot lose them to a storage change.
