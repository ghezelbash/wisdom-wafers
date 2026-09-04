import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';

import { deleteAccount, DeletionError } from './account/delete';
import { ingestProgressEvents } from './progress/ingest';
import { submitReports } from './reports/submit';
import { recordTelemetry } from './telemetry/record';
import { publishDraft, reviewDraft, submitDraft, WorkflowError } from './publish/drafts';
import { publishSeed, rollbackSeed, PublishError } from './publish/publish-seed';
import { defaultDeps } from './shared/deps';

// One region for now; latency for real users decides the final choice.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const deps = () => defaultDeps();

function requireStaff(auth: { token?: Record<string, unknown> } | undefined, roles: string[]) {
  const token = auth?.token ?? {};
  if (!roles.some((role) => token[role] === true)) {
    throw new HttpsError('permission-denied', 'staff-only');
  }
}

/**
 * Publishing is server-only.
 *
 * Rules keep clients out of `seeds` and `seedRevisions` entirely; this is the
 * one door in, and it validates before it writes anything.
 */
export const publish = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);

  try {
    return await publishSeed(deps(), {
      seed: request.data?.seed,
      locale: request.data?.locale,
      actorUid: request.auth!.uid,
    });
  } catch (error) {
    if (error instanceof PublishError) {
      throw new HttpsError('failed-precondition', error.code, { issues: error.issues });
    }
    throw error;
  }
});

/**
 * Turns a workflow failure into something the CMS can act on.
 *
 * `PublishError` is included because publishing is the last step of the
 * workflow: an approved draft whose revision is already live raises
 * `revision-exists`, which is an ordinary editorial condition — a correction
 * needs a new revision number — and surfaced as `INTERNAL` it read to an editor
 * as "something is broken".
 */
function workflowCall<T>(handler: () => Promise<T>) {
  return handler().catch((error) => {
    if (error instanceof WorkflowError) {
      throw new HttpsError('failed-precondition', error.code, { issues: error.issues });
    }
    if (error instanceof PublishError) {
      throw new HttpsError('failed-precondition', error.code, { issues: error.issues });
    }
    throw error;
  });
}

export const submitForReview = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);
  return workflowCall(() =>
    submitDraft(deps(), { draftId: request.data?.draftId, actorUid: request.auth!.uid })
  );
});

export const review = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'reviewer']);
  return workflowCall(() =>
    reviewDraft(deps(), {
      draftId: request.data?.draftId,
      actorUid: request.auth!.uid,
      decision: request.data?.decision,
      note: request.data?.note,
    })
  );
});

export const publishApproved = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);
  return workflowCall(() =>
    publishDraft(deps(), { draftId: request.data?.draftId, actorUid: request.auth!.uid })
  );
});

export const rollback = onCall(async (request) => {
  requireStaff(request.auth, ['admin']);

  try {
    return await rollbackSeed(deps(), {
      seedId: request.data?.seedId,
      toRevision: request.data?.toRevision,
      actorUid: request.auth!.uid,
    });
  } catch (error) {
    if (error instanceof PublishError) {
      throw new HttpsError('failed-precondition', error.code);
    }
    throw error;
  }
});

/**
 * The outbox's endpoint. Idempotent by event id, so a client that retries
 * after a dropped connection cannot double-count a completion.
 */
export const ingestProgress = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');

  const events = Array.isArray(request.data?.events) ? request.data.events : [];
  if (events.length > 200) throw new HttpsError('invalid-argument', 'too-many-events');

  return ingestProgressEvents(deps(), { uid: request.auth.uid, events });
});

/**
 * Content reports, from the same queue and with the same contract.
 *
 * Rules keep clients out of `reports` entirely: the reporter's uid, the
 * received time and the triage state are all set here, where they cannot be
 * forged.
 */
export const submitReport = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');

  const reports = Array.isArray(request.data?.reports) ? request.data.reports : [];
  if (reports.length > 50) throw new HttpsError('invalid-argument', 'too-many-reports');

  return submitReports(deps(), { uid: request.auth.uid, reports });
});

/**
 * Delete account.
 *
 * Server-only, because it has to reach subcollections, Storage files, push
 * tokens and the Auth record — none of which a client delete would touch. It
 * requires a recent sign-in: erasing everything is exactly the operation a
 * borrowed unlocked phone must not be able to perform.
 *
 * The device wipes only after this returns `done`. A partial failure leaves the
 * reader signed in and told, rather than looking at an empty app whose data is
 * still here.
 */
export const deleteMyAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');

  try {
    return await deleteAccount(deps(), {
      uid: request.auth.uid,
      authTimeSeconds: request.auth.token?.auth_time as number | undefined,
    });
  } catch (error) {
    if (error instanceof DeletionError) {
      throw new HttpsError(
        error.code === 'requires-recent-login' ? 'failed-precondition' : 'internal',
        error.code,
        { step: error.step }
      );
    }
    throw error;
  }
});

/**
 * Analytics events and crash reports.
 *
 * The client refuses a payload with unsafe parameters before queueing it; this
 * refuses it again, because a client is not a trust boundary. An old build
 * still in the field can send whatever it likes, and an event carrying free
 * text is rejected rather than sanitised.
 */
export const recordTelemetryBatch = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');

  const events = Array.isArray(request.data?.events) ? request.data.events : [];
  const crashes = Array.isArray(request.data?.crashes) ? request.data.crashes : [];
  if (events.length + crashes.length > 100) {
    throw new HttpsError('invalid-argument', 'too-many-items');
  }

  return recordTelemetry(deps(), { uid: request.auth.uid, events, crashes });
});
