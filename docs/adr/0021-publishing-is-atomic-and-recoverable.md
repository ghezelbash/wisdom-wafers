# 21. Publishing is atomic, and recoverable

Date: 2026-09-05 · Status: accepted · Extends ADR 11

## Context

ADR 11 made a published revision immutable *by policy*: `publishSeed` checked
whether the revision document existed and refused if it did. That is two
operations with a gap in the middle, and under concurrency both callers passed
the check before either wrote.

The consequence was specific and bad. Both uploaded to the same Storage path,
the second overwrote the first, and whichever transaction committed last set the
catalogue checksum. The artifact then held one publisher's bytes under the
other's checksum — which every device would refuse as corrupt, having verified
exactly as designed.

Rollback had a quieter version of the same problem. It moved the pointer and the
manifest, but the catalogue document is a *summary*: the title, objective,
topic, difficulty and duration stayed at whatever the newest revision had set.
A rollback showed the newer text with the older content behind it.

And the editorial transitions were read-then-write with a separate audit append.
Two reviewers acting at once both saw `in_review`, both wrote, and the trail
recorded two transitions for a state that changed once. A failure between the
write and the append left a transition nobody could account for.

## Decision

**Reserve, then write, then finalise.**

1. A transaction creates `seedRevisions/{id}_{rev}` as `reserved`. Exactly one
   caller gets that far; the other is refused before touching Storage.
2. The artifact is uploaded with `ifAbsent`, which the storage layer enforces
   with `ifGenerationMatch: 0`. The precondition is the backstop for anything
   the transaction cannot see.
3. A second transaction flips the revision to `published` and moves the
   catalogue pointer.

A reservation left by a run that died is **resumable**, not fatal — but only by
the same bytes. The reservation carries the checksum, so a retry with different
content is refused: same revision number, different text, and no answer that is
true of both.

**Rollback restores the whole summary.** Each revision document now carries the
title, objective, topic, difficulty, duration and locale it was published with,
so a rollback is a complete restore rather than a pointer move with leftovers.

**A transition and its audit entry commit together.** `transition()` re-reads
the draft inside the transaction and writes both — so the audit trail cannot
claim a state changed twice when it changed once, and cannot lose an entry for
one that did.

**Publishing claims the draft first.** `approved → publishing → published`,
with the claim in a transaction, so two editors pressing publish do not both
call the pipeline and have one surface a failure for content that shipped. A
pipeline refusal returns the draft to `approved` rather than stranding it.

**Drafts are created through the pipeline.** `createContentDraft` and
`startCorrection` replace inserting a document into Firestore by hand — which is
how a draft ends up with an author who did not write it, a state that skips
review, or a revision number typed wrong and discovered at the last step.
Authorship is the caller, always.

## Consequences

- `DraftState` gains `publishing`. It is transient, and a pipeline failure
  clears it.
- An orphaned reservation is visible: `seedRevisions` where `status ==
  'reserved'` and older than a few minutes is a publish that died. Re-running it
  with the same content finishes it; nothing points at it meanwhile, because
  readers follow the catalogue.
- `tests/integration/publish-concurrency.test.ts` runs the races for real —
  concurrent publishes, concurrent reviews, concurrent publish-draft — and
  asserts one winner, one artifact, one audit entry.
- The in-memory bucket in those tests refuses to overwrite when `ifAbsent` is
  set, so the precondition is exercised rather than assumed.
