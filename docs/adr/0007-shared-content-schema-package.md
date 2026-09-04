# 7. One content schema, shared by app, pipeline and CMS

Date: 2026-09-03 · Status: accepted

## Context

The same content shape is written by the CMS, validated by the publish
pipeline, stored as a bundle and rendered by the app. Three copies of that
definition would drift, and the drift would surface as a broken screen.

## Decision

`packages/content-schema` is the single definition: Zod schemas for blocks,
seeds, bundles, topics, paths and progress events, plus the canonical
serialization and SHA-256 used for bundle checksums. The app, Cloud Functions
and the admin all depend on it through npm workspaces. `src/models/seed.ts` is a
thin re-export so screens are unaffected.

## Consequences

- Checksums are computed by one function in plain TypeScript, so the publisher
  and the on-device verifier cannot disagree.
- The wire format (`SeedBundle`, blueprint §6.2) and the domain shape (`Seed`)
  are mapped explicitly rather than assumed identical; the mapping is tested.
- A schema change is a versioned, reviewable event with a compatibility test.
