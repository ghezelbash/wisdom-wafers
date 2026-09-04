# 3. Block registry with a named fallback

Date: 2026-09-03 · Status: accepted

## Context

Content is published independently of app releases, so a reader will eventually
open a seed containing a block type their build has never heard of.

## Decision

Blocks render from a registry keyed by `block.type`. A missing key renders a
named fallback that states progress is kept, and logs the type. Parsing has two
modes: `parseBundleStrict` at the publish gate rejects unknown types;
`parseBundleLenient` on the client keeps them as `{id, type}`.

## Consequences

- One unrecognised block can never cost a reader the rest of a seed.
- `seed-unknown-block` is a permanent fixture so the path stays exercised, with
  a test asserting the fallback renders and nothing throws.
- `schemaVersion` and `revision` travel with content; a revision change resets
  cached progress rather than mis-mapping it onto different blocks.
