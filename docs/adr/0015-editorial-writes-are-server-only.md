# 15. Editorial writes are server-only

Date: 2026-09-04 · Status: accepted · Extends ADR 6

## Context

ADR 6 established that rules are developed against the emulator and tested for
denial. The CMS rules were not written to that standard: `cmsDrafts` allowed any
editorial role to create or update **any field** except `publishedRevision`, and
`cmsReviews` let a reviewer create audit rows directly.

The Function enforces the rule that matters — an editor may not approve their
own draft — by reading `authorUid` and `state` off the draft document. But the
document was client-writable, so an editor with a REST client or the SDK could:

1. set `state: 'approved'` on their own draft, and
2. call `publishApproved`, which checks only that the state *is* approved.

Every check the Function makes would pass, because the Function trusts the
document. The audit trail could be forged the same way — write a `cmsReviews`
row naming someone else as the approver.

**Rules and Functions are two doors into the same room.** Enforcing a rule in
one and leaving the other open enforces nothing.

## Decision

A client may write **content**, and nothing else.

- **Create** requires `authorUid == request.auth.uid` and `state == 'draft'`,
  and refuses any of `reviewerUid`, `approvedBy`, `approvedAt`,
  `publishedRevision`, `publishedAt`, `publishedBy`.
- **Update** is restricted to `['seed', 'title', 'updatedAt']`, and only while
  the draft is in `draft` or `changes_requested`. A draft in review is frozen —
  a reviewer has to be looking at the text that was submitted.
- **`cmsReviews` is `write: if false`.** The audit trail is written by the
  Function or not at all.

Every transition therefore goes through `functions/src/publish/drafts.ts`, which
is the only place that can see authorship and act on it.

## Consequences

- The CMS's Save button is disabled while a draft is in review, with a title
  explaining why. The rule would otherwise surface as an opaque permission
  error the editor could not act on.
- Rules tests now assert the **deny** side for each of these: state transitions
  by every role, forged authorship, forged approval fields, editing a frozen
  draft, and writing or deleting an audit row. Published seeds and revisions are
  asserted immutable to editors, reviewers and admins alike.
- `tests/static/secrets.test.ts` checks what git actually tracks, not what
  `.gitignore` claims — a file added before a rule was written stays tracked
  despite it. It also asserts Firebase config is read from the environment
  rather than a literal, so a build cannot silently point at the wrong project.
- A future "duplicate draft" or "create draft" feature in the CMS has to write
  through a Function, or add its fields to the update allow-list deliberately.
