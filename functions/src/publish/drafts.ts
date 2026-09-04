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

/** Every transition is recorded: who, when, from what, to what. */
async function audit(
  deps: Deps,
  entry: { draftId: string; actorUid: string; from: DraftState; to: DraftState; note?: string }
) {
  await deps.db.collection('cmsReviews').add({
    draftId: entry.draftId,
    actorUid: entry.actorUid,
    from: entry.from,
    to: entry.to,
    // Firestore rejects `undefined`; an absent note is an absent field.
    ...(entry.note ? { note: entry.note } : {}),
    at: deps.now().toISOString(),
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
  const draft = await readDraft(deps, input.draftId);
  if (draft.state !== 'draft' && draft.state !== 'changes_requested') {
    throw new WorkflowError('wrong-state');
  }

  const validation = parseSeedStrict(draft.seed);
  if (!validation.ok) throw new WorkflowError('invalid', validation.issues);

  await draftRef(deps, input.draftId).set(
    { state: 'in_review', updatedAt: deps.now().toISOString() },
    { merge: true }
  );
  await audit(deps, {
    draftId: input.draftId,
    actorUid: input.actorUid,
    from: draft.state,
    to: 'in_review',
  });

  return { state: 'in_review' };
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
  const draft = await readDraft(deps, input.draftId);
  if (draft.state !== 'in_review') throw new WorkflowError('wrong-state');

  // The one rule that makes review mean anything.
  if (input.decision === 'approve' && draft.authorUid === input.actorUid) {
    throw new WorkflowError('self-approval');
  }

  const state: DraftState = input.decision === 'approve' ? 'approved' : 'changes_requested';

  await draftRef(deps, input.draftId).set(
    {
      state,
      reviewerUid: input.actorUid,
      note: input.note ?? null,
      updatedAt: deps.now().toISOString(),
    },
    { merge: true }
  );
  await audit(deps, {
    draftId: input.draftId,
    actorUid: input.actorUid,
    from: 'in_review',
    to: state,
    note: input.note,
  });

  return { state };
}

/** Publishing an approved draft; the pipeline still validates independently. */
export async function publishDraft(
  deps: Deps,
  input: { draftId: string; actorUid: string }
): Promise<PublishResult> {
  const draft = await readDraft(deps, input.draftId);
  if (draft.state !== 'approved') throw new WorkflowError('not-approved');

  const result = await publishSeed(deps, { seed: draft.seed, actorUid: input.actorUid });

  await draftRef(deps, input.draftId).set(
    {
      state: 'published',
      publishedRevision: result.revision,
      updatedAt: deps.now().toISOString(),
    },
    { merge: true }
  );
  await audit(deps, {
    draftId: input.draftId,
    actorUid: input.actorUid,
    from: 'approved',
    to: 'published',
  });

  return result;
}
