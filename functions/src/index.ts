import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  accountDeletionStatus,
  beginAccountDeletion,
  deleteAccount,
  DeletionError,
} from './account/delete';
import { ingestProgressEvents } from './progress/ingest';
import { submitReports } from './reports/submit';
import { recordTelemetry } from './telemetry/record';
import { sweepExpired, writeOpsDigest, RETENTION_DAYS } from './telemetry/retention';
import {
  createDraft,
  duplicateForCorrection,
  publishDraft,
  reviewDraft,
  submitDraft,
  WorkflowError,
} from './publish/drafts';
import { publishSeed, rollbackSeed, PublishError } from './publish/publish-seed';
import { defaultDeps } from './shared/deps';
import { guard, GuardError } from './shared/guard';

// One region for now; latency for real users decides the final choice.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const deps = () => defaultDeps();

/**
 * The size, batch, rate and App Check checks, run before a handler.
 *
 * A `CallableRequest` is narrowed to what the guard needs so the guard itself
 * stays testable without the functions runtime. `request.app` is set only when
 * a *verified* App Check token arrived — enforcement is off, so an unverified
 * call proceeds and is counted.
 */
async function checked(
  request: { data?: unknown; app?: unknown },
  options: { name: string; key: string; items?: number }
) {
  try {
    await guard(deps(), {
      ...options,
      data: request.data,
      appCheckVerified: request.app != null,
    });
  } catch (error) {
    if (error instanceof GuardError) {
      throw new HttpsError(
        error.code === 'rate-limited' ? 'resource-exhausted' : 'invalid-argument',
        error.code,
        // The client defers rather than failing the item, so it needs to know
        // for how long. Without this it would guess, and a guess that is short
        // spends the caller's retry budget on being throttled again.
        error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : undefined
      );
    }
    throw error;
  }
}

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
  await checked(request, { name: 'publish', key: request.auth!.uid });

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

/**
 * Creating content, through the pipeline.
 *
 * It was a manual Firestore insert, which is how a draft ends up with an author
 * who did not write it or a state that skips review. Authorship is the caller.
 */
export const createContentDraft = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);
  await checked(request, { name: 'createContentDraft', key: request.auth!.uid });
  return workflowCall(() =>
    createDraft(deps(), {
      actorUid: request.auth!.uid,
      seed: request.data?.seed,
      draftId: request.data?.draftId,
    })
  );
});

/** Starts a correction at the next revision, derived rather than typed. */
export const startCorrection = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);
  await checked(request, { name: 'startCorrection', key: request.auth!.uid });
  return workflowCall(() =>
    duplicateForCorrection(deps(), {
      actorUid: request.auth!.uid,
      seedId: request.data?.seedId,
    })
  );
});

export const submitForReview = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'editor']);
  await checked(request, { name: 'submitForReview', key: request.auth!.uid });
  return workflowCall(() =>
    submitDraft(deps(), { draftId: request.data?.draftId, actorUid: request.auth!.uid })
  );
});

export const review = onCall(async (request) => {
  requireStaff(request.auth, ['admin', 'reviewer']);
  await checked(request, { name: 'review', key: request.auth!.uid });
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
  await checked(request, { name: 'publishApproved', key: request.auth!.uid });
  return workflowCall(() =>
    publishDraft(deps(), { draftId: request.data?.draftId, actorUid: request.auth!.uid })
  );
});

export const rollback = onCall(async (request) => {
  requireStaff(request.auth, ['admin']);
  await checked(request, { name: 'rollback', key: request.auth!.uid });

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
  await checked(request, {
    name: 'ingestProgress',
    key: request.auth.uid,
    items: events.length,
  });

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
  await checked(request, { name: 'submitReport', key: request.auth.uid, items: reports.length });

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
  await checked(request, { name: 'deleteMyAccount', key: request.auth.uid });

  try {
    return await deleteAccount(deps(), {
      uid: request.auth.uid,
      authTimeSeconds: request.auth.token?.auth_time as number | undefined,
      receipt: typeof request.data?.receipt === 'string' ? request.data.receipt : undefined,
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
 * Step one of deleting an account: prove who you are, and take a receipt.
 *
 * Nothing is destroyed. The receipt is what lets a device ask what happened
 * after the Auth record — deleted last — is gone, at which point there is no
 * session left to ask with.
 */
export const beginDeleteMyAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in-required');
  await checked(request, { name: 'beginDeleteMyAccount', key: request.auth.uid });

  try {
    return await beginAccountDeletion(deps(), {
      uid: request.auth.uid,
      authTimeSeconds: request.auth.token?.auth_time as number | undefined,
    });
  } catch (error) {
    if (error instanceof DeletionError) {
      throw new HttpsError('failed-precondition', error.code);
    }
    throw error;
  }
});

/**
 * Resumes or finishes a deletion using its receipt.
 *
 * Deliberately not requiring a session: by the time this is needed the account
 * may already be gone. The receipt is a high-entropy capability minted by an
 * authenticated, recently-signed-in request, and it can do exactly two things,
 * both idempotent — finish this one deletion, and report on it.
 */
export const resumeDeleteMyAccount = onCall(async (request) => {
  const uid = request.data?.uid;
  const receipt = request.data?.receipt;
  if (typeof uid !== 'string' || typeof receipt !== 'string' || receipt.length < 16) {
    throw new HttpsError('invalid-argument', 'receipt-required');
  }

  // Keyed by the uid being claimed rather than by a session, because there is
  // no session left by this point. It is what makes guessing a receipt
  // impractical: ten attempts a minute against a 256-bit secret.
  await checked(request, { name: 'resumeDeleteMyAccount', key: uid });

  try {
    return await deleteAccount(deps(), { uid, receipt });
  } catch (error) {
    if (error instanceof DeletionError) {
      throw new HttpsError(
        error.code === 'requires-recent-login' ? 'permission-denied' : 'internal',
        error.code,
        { step: error.step }
      );
    }
    throw error;
  }
});

/** What happened to a deletion, for a device that can no longer authenticate. */
export const myAccountDeletionStatus = onCall(async (request) => {
  const uid = request.data?.uid;
  const receipt = request.data?.receipt;
  if (typeof uid !== 'string' || typeof receipt !== 'string') {
    throw new HttpsError('invalid-argument', 'receipt-required');
  }

  await checked(request, { name: 'myAccountDeletionStatus', key: uid });

  const status = await accountDeletionStatus(deps(), { uid, receipt });
  if (!status) throw new HttpsError('not-found', 'unknown-receipt');
  return status;
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
  await checked(request, {
    name: 'recordTelemetryBatch',
    key: request.auth.uid,
    items: events.length + crashes.length,
  });

  return recordTelemetry(deps(), { uid: request.auth.uid, events, crashes });
});


// ------------------------------------------------------- operating telemetry

/**
 * Yesterday, as one document.
 *
 * Until Crashlytics lands, `crashReports` in Firestore is the crash trail — and
 * a thousand documents are not an alert. This is the figure the thresholds in
 * `docs/runbooks/observability.md` are written against; the operator script
 * reads the same document.
 *
 * Yesterday rather than today because an event that happened offline arrives
 * late, and a digest of a day still in progress reports a dip that is only the
 * clock. It runs again for the same day harmlessly — the write is a `set`.
 */
export const dailyOpsDigest = onSchedule(
  { schedule: '30 1 * * *', timeZone: 'Asia/Tehran', region: 'europe-west1' },
  async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const digest = await writeOpsDigest(defaultDeps(), yesterday);

    console.log(
      JSON.stringify({
        message: 'ops-digest',
        day: digest.day,
        crashes: digest.crashes,
        fatalCrashes: digest.fatalCrashes,
        affectedSessions: digest.affectedSessions,
        events: digest.events,
      })
    );
  }
);

/**
 * Telemetry expires.
 *
 * A collection nobody deletes grows without limit and turns a modest privacy
 * promise into a permanent record of what every reader did. Bounded per run:
 * a partial sweep that runs again tomorrow beats a complete one that times out
 * and deletes nothing.
 */
export const sweepTelemetry = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Asia/Tehran', region: 'europe-west1' },
  async () => {
    const deps = defaultDeps();

    for (const collection of Object.keys(RETENTION_DAYS) as (keyof typeof RETENTION_DAYS)[]) {
      let deleted = 0;
      let remaining = true;

      // A few passes per night, not an unbounded loop: the rest keeps until
      // tomorrow, and the function cannot run itself out of its own timeout.
      for (let pass = 0; pass < 5 && remaining; pass += 1) {
        const swept = await sweepExpired(deps, { collection });
        deleted += swept.deleted;
        remaining = swept.remaining;
      }

      console.log(
        JSON.stringify({ message: 'telemetry-sweep', collection, deleted, remaining })
      );
    }
  }
);
