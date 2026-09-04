import { parseSeedStrict, type Seed } from '@dananeh/content-schema';

import type { Deps } from '../shared/deps';
import { publishSeed, type PublishResult } from './publish-seed';

/**
 * The editorial state machine (blueprint §12.1).
 *
 * Draft → InReview → Approved → Published, with ChangesRequested looping back.
 * Two rules are enforced here rather than in security rules, because rules
 * cannot see who wrote what: an editor may not approve their own draft, and
 * only an approved draft can be published.
 */
export type DraftState =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  /** Claimed by one publisher; the pipeline is running. */
  | 'publishing'
  | 'published'
  | 'withdrawn';

export class WorkflowError extends Error {
  constructor(
    readonly code:
      | 'not-found'
      | 'wrong-state'
      | 'self-approval'
      | 'invalid'
      | 'not-approved',
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(code);
    this.name = 'WorkflowError';
  }
}

interface DraftDoc {
  draftId: string;
  state: DraftState;
  authorUid: string;
  seed: Seed;
  updatedAt: string;
  reviewerUid?: string;
  note?: string;
}

const draftRef = (deps: Deps, draftId: string) => deps.db.collection('cmsDrafts').doc(draftId);

async function readDraft(deps: Deps, draftId: string): Promise<DraftDoc> {
  const snapshot = await draftRef(deps, draftId).get();
  if (!snapshot.exists) throw new WorkflowError('not-found');
  return snapshot.data() as DraftDoc;
}

interface AuditEntry {
  draftId: string;
  actorUid: string;
  from: DraftState;
  to: DraftState;
  note?: string;
}

const auditPayload = (deps: Deps, entry: AuditEntry) => ({
  draftId: entry.draftId,
  actorUid: entry.actorUid,
  from: entry.from,
  to: entry.to,
  // Firestore rejects `undefined`; an absent note is an absent field.
  ...(entry.note ? { note: entry.note } : {}),
  at: deps.now().toISOString(),
});

/**
 * One transition, as one operation.
 *
 * Reading the state, writing the new one and appending the audit entry used to
 * be three separate calls. Two reviewers acting at once both read `in_review`
 * and both wrote, producing two audit entries for a state that changed once —
 * and a failure between the write and the audit left a transition nobody could
 * account for.
 *
 * `guard` re-reads inside the transaction and decides; the state and its audit
 * entry then commit together or not at all.
 */
async function transition<T>(
  deps: Deps,
  draftId: string,
  guard: (draft: DraftDoc) => { patch: Record<string, unknown>; audit: AuditEntry; result: T }
): Promise<T> {
  const ref = draftRef(deps, draftId);
  const auditRef = deps.db.collection('cmsReviews').doc();

  return deps.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new WorkflowError('not-found');

    const decided = guard(snapshot.data() as DraftDoc);

    tx.set(ref, { ...decided.patch, updatedAt: deps.now().toISOString() }, { merge: true });
    tx.set(auditRef, auditPayload(deps, decided.audit));

    return decided.result;
  });
}

/**
 * Submitting runs the publish gate early.
 *
 * A reviewer should spend their attention on whether the content is *right*,
 * not on whether it is structurally complete — that part is mechanical.
 */
export async function submitDraft(
  deps: Deps,
  input: { draftId: string; actorUid: string }
): Promise<{ state: DraftState }> {
  // Validated before the transaction: it is pure, and a long transaction is a
  // contended one.
  const draft = await readDraft(deps, input.draftId);
  const validation = parseSeedStrict(draft.seed);
  if (!validation.ok) throw new WorkflowError('invalid', validation.issues);

  return transition(deps, input.draftId, (current) => {
    if (current.state !== 'draft' && current.state !== 'changes_requested') {
      throw new WorkflowError('wrong-state');
    }
    return {
      patch: { state: 'in_review' },
      audit: {
        draftId: input.draftId,
        actorUid: input.actorUid,
        from: current.state,
        to: 'in_review',
      },
      result: { state: 'in_review' as DraftState },
    };
  });
}

export async function reviewDraft(
  deps: Deps,
  input: {
    draftId: string;
    actorUid: string;
    decision: 'approve' | 'request_changes';
    note?: string;
  }
): Promise<{ state: DraftState }> {
  return transition(deps, input.draftId, (current) => {
    // Re-read inside the transaction: two reviewers acting at once both saw
    // `in_review` before either wrote.
    if (current.state !== 'in_review') throw new WorkflowError('wrong-state');

    // The one rule that makes review mean anything.
    if (input.decision === 'approve' && current.authorUid === input.actorUid) {
      throw new WorkflowError('self-approval');
    }

    const state: DraftState = input.decision === 'approve' ? 'approved' : 'changes_requested';

    return {
      patch: { state, reviewerUid: input.actorUid, note: input.note ?? null },
      audit: {
        draftId: input.draftId,
        actorUid: input.actorUid,
        from: 'in_review',
        to: state,
        note: input.note,
      },
      result: { state },
    };
  });
}

/** Publishing an approved draft; the pipeline still validates independently. */
export async function publishDraft(
  deps: Deps,
  input: { draftId: string; actorUid: string }
): Promise<PublishResult> {
  /**
   * Claimed before publishing, not after.
   *
   * Two editors pressing publish at once both read `approved` and both called
   * the pipeline; one lost the race on the revision and surfaced as a failure
   * for content that had in fact shipped. Moving to `publishing` first means
   * exactly one caller gets that far.
   */
  const draft = await transition(deps, input.draftId, (current) => {
    if (current.state !== 'approved') throw new WorkflowError('not-approved');
    return {
      patch: { state: 'publishing' },
      audit: {
        draftId: input.draftId,
        actorUid: input.actorUid,
        from: 'approved',
        to: 'publishing',
      },
      result: current,
    };
  });

  let result: PublishResult;
  try {
    result = await publishSeed(deps, { seed: draft.seed, actorUid: input.actorUid });
  } catch (error) {
    // Back to approved, so the draft is not stuck mid-flight and the editor can
    // act on whatever the pipeline objected to.
    await draftRef(deps, input.draftId).set(
      { state: 'approved', updatedAt: deps.now().toISOString() },
      { merge: true }
    );
    throw error;
  }

  await transition(deps, input.draftId, (current) => ({
    patch: { state: 'published', publishedRevision: result.revision },
    audit: {
      draftId: input.draftId,
      actorUid: input.actorUid,
      from: current.state,
      to: 'published',
    },
    result: undefined,
  }));

  return result;
}

/**
 * A new draft, made by the pipeline rather than by hand.
 *
 * Creating content meant inserting a document into Firestore directly, which
 * is how a draft ends up with an author who did not write it, a state that
 * skips review, or a seed shape nothing validated. The id and the authorship
 * are decided here; the client supplies content and nothing else.
 */
export async function createDraft(
  deps: Deps,
  input: { actorUid: string; seed: Seed; draftId?: string }
): Promise<{ draftId: string; state: DraftState }> {
  const draftId = input.draftId?.trim() || `draft-${deps.now().getTime().toString(36)}`;

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(draftId)) {
    throw new WorkflowError('invalid', [{ path: 'draftId', message: 'unusable id' }]);
  }
  if (!input.seed || typeof input.seed !== 'object') {
    throw new WorkflowError('invalid', [{ path: 'seed', message: 'a draft needs content' }]);
  }

  const ref = draftRef(deps, draftId);
  const auditRef = deps.db.collection('cmsReviews').doc();

  await deps.db.runTransaction(async (tx) => {
    // Never silently replaces an existing draft: someone else's work is not a
    // detail to overwrite.
    if ((await tx.get(ref)).exists) throw new WorkflowError('wrong-state');

    tx.set(ref, {
      draftId,
      state: 'draft' satisfies DraftState,
      // Authorship is whoever is signed in, not whoever says so — the
      // self-approval rule is only meaningful if this cannot be chosen.
      authorUid: input.actorUid,
      seed: input.seed,
      createdAt: deps.now().toISOString(),
      updatedAt: deps.now().toISOString(),
    });

    tx.set(
      auditRef,
      auditPayload(deps, {
        draftId,
        actorUid: input.actorUid,
        from: 'draft',
        to: 'draft',
        note: 'created',
      })
    );
  });

  return { draftId, state: 'draft' };
}

/**
 * Starts a correction to something already published.
 *
 * A published revision is immutable, so the only way to change content is a new
 * revision — and getting that number right by hand is how a publish fails at
 * the last step. It is derived from the catalogue instead.
 */
export async function duplicateForCorrection(
  deps: Deps,
  input: { actorUid: string; seedId: string }
): Promise<{ draftId: string; revision: number }> {
  const snapshot = await deps.db.collection('seeds').doc(input.seedId).get();
  const current = snapshot.data();
  if (!snapshot.exists || !current) throw new WorkflowError('not-found');

  const bundlePath = current.storagePath as string | undefined;
  if (!bundlePath) throw new WorkflowError('not-found');

  const revision = ((current.currentRevision as number) ?? 0) + 1;
  const seed = { ...(current.seed as Seed | undefined) } as Seed;

  // The catalogue document holds a summary, not the blocks, so a correction
  // starts from the summary and the editor pastes the content. Better than
  // guessing at blocks that would then fail the publish gate.
  const draft = await createDraft(deps, {
    actorUid: input.actorUid,
    draftId: `${input.seedId}-r${revision}`,
    seed: {
      ...seed,
      id: input.seedId,
      revision,
      title: current.title as string,
      promise: current.objective as string,
      topicId: current.topicId as string,
      estimatedMinutes: current.estimatedMinutes as number,
    } as Seed,
  });

  return { draftId: draft.draftId, revision };
}
