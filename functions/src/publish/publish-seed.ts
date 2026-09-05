import {
  computeChecksum,
  manifestFor,
  parseManifest,
  parseBundleStrict,
  seedToBundle,
  type ParseResult,
  type Seed,
  type SeedBundle,
  type SeedManifest,
} from '@dananeh/content-schema';

import type { Deps } from '../shared/deps';

export interface PublishInput {
  /** The authored seed, in the domain shape the CMS and fixtures use. */
  seed: Seed;
  locale?: 'fa-IR' | 'en';
  /** Who is publishing; recorded on the revision for the audit trail. */
  actorUid: string;
}

export interface PublishResult {
  seedId: string;
  revision: number;
  checksum: string;
  /** The Storage object path — not a URL; the client resolves it through the SDK. */
  storagePath: string;
  bytes: number;
  manifest: SeedManifest;
}

export class PublishError extends Error {
  constructor(
    readonly code: 'invalid' | 'revision-exists' | 'not-found',
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(code);
    this.name = 'PublishError';
  }
}

export const bundleStoragePath = (seedId: string, revision: number) =>
  `content/seeds/${seedId}/${revision}/bundle.json`;

/**
 * Publish one seed revision.
 *
 * The order matters and is the whole point:
 *   1. validate against the strict schema — nothing invalid gets an artifact;
 *   2. compile and checksum the bundle;
 *   3. upload the immutable artifact;
 *   4. flip the catalogue pointer in a transaction.
 *
 * If step 4 fails, the artifact is orphaned but nothing is *published*: readers
 * only ever follow the pointer. Rollback is the same flip in reverse, which is
 * why old artifacts are never deleted.
 */
export async function publishSeed(deps: Deps, input: PublishInput): Promise<PublishResult> {
  const draft = seedToBundle(input.seed, {
    locale: input.locale,
    publishedAt: deps.now().toISOString(),
  });

  const checksum = computeChecksum({ ...draft, checksum: '' });
  const bundle: SeedBundle = { ...draft, checksum };

  const validation: ParseResult<SeedBundle> = parseBundleStrict(bundle);
  if (!validation.ok) {
    throw new PublishError('invalid', validation.issues);
  }

  const revisionId = `${bundle.seedId}_${bundle.revision}`;
  const revisionRef = deps.db.collection('seedRevisions').doc(revisionId);
  const seedRef = deps.db.collection('seeds').doc(bundle.seedId);

  const path = bundleStoragePath(bundle.seedId, bundle.revision);
  const body = JSON.stringify(bundle);
  // Measured over the exact bytes uploaded, so the size a reader is quoted
  // before a download is the size the object actually is.
  const bytes = Buffer.byteLength(body, 'utf8');
  const manifest = manifestFor(bundle, { storagePath: path, bytes });

  /**
   * Reserve the revision before writing anything.
   *
   * Checking for an existing document and then uploading is two operations
   * with a gap in the middle, and two publishes of the same revision both
   * passed the check before either wrote. The transaction closes that: exactly
   * one caller creates the document, and the other is refused before it can
   * touch Storage.
   *
   * A reservation left behind by a run that died is *resumable* rather than
   * fatal — the checksum identifies the bytes, so finishing it produces the
   * same artifact the first attempt intended.
   */
  const reserved = await deps.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(revisionRef);
    const current = snapshot.data();

    if (current?.status === 'published') {
      // A published revision is immutable. Correcting content means a new
      // revision, so a reader's recorded progress keeps pointing at the exact
      // text they answered against.
      return { taken: true, resumable: false };
    }

    // Someone else is mid-publish of this exact revision with different bytes;
    // there is no way to make both true.
    if (current?.status === 'reserved' && current.checksum !== checksum) {
      return { taken: true, resumable: false };
    }

    const resuming = current?.status === 'reserved';
    transaction.set(revisionRef, {
      ...manifest,
      status: 'reserved',
      locale: bundle.locale,
      publishedBy: input.actorUid,
      reservedAt: deps.now().toISOString(),
    });

    return { taken: false, resumable: resuming };
  });

  if (reserved.taken) throw new PublishError('revision-exists');

  /**
   * The artifact, written once.
   *
   * `ifAbsent` on a resumed reservation would refuse the object the previous
   * attempt already uploaded, so a resume writes over its own identical bytes —
   * identical because the reservation only survived the checksum check above.
   */
  const storedAt = await deps.putObject(path, body, 'application/json', {
    ifAbsent: !reserved.resumable,
  }).catch((error: unknown) => {
    // Losing the precondition means someone else uploaded first. The
    // reservation is theirs; this attempt has nothing left to do.
    if (String((error as Error)?.message ?? '').includes('412')) {
      throw new PublishError('revision-exists');
    }
    throw error;
  });

  await deps.db.runTransaction(async (transaction) => {
    const seedSnapshot = await transaction.get(seedRef);
    const current = seedSnapshot.data();

    /**
     * Everything a rollback needs to restore, on the revision itself.
     *
     * The catalogue document is a *summary*, and rollback used to move only
     * the pointer and the manifest — leaving the title, objective, topic,
     * difficulty and duration of whichever revision was published last. A
     * reader would see the newer text with the older content behind it.
     */
    transaction.set(revisionRef, {
      ...manifest,
      status: 'published',
      /** Where the bucket put it, for operators; clients follow `storagePath`. */
      storedAt,
      locale: bundle.locale,
      title: bundle.title,
      objective: bundle.objective,
      topicId: bundle.topicId,
      difficulty: bundle.difficulty,
      estimatedMinutes: bundle.estimatedMinutes,
      publishedBy: input.actorUid,
    });

    // The catalogue document is what clients query, so it carries only what a
    // list needs — never the blocks.
    transaction.set(
      seedRef,
      {
        status: 'published',
        /** The pointer. `revision` on the manifest below is the same number;
         *  this is the field the CMS and the indexes query on. */
        currentRevision: bundle.revision,
        previousRevision: current?.currentRevision ?? null,
        topicId: bundle.topicId,
        title: bundle.title,
        objective: bundle.objective,
        difficulty: bundle.difficulty,
        estimatedMinutes: bundle.estimatedMinutes,
        locale: bundle.locale,
        // The manifest: everything a device needs to fetch the artifact and
        // prove it is the one that was published.
        ...manifest,
        updatedAt: deps.now().toISOString(),
      },
      { merge: true }
    );
  });

  return { seedId: bundle.seedId, revision: bundle.revision, checksum, storagePath: path, bytes, manifest };
}

/**
 * Roll a seed back to an earlier published revision.
 *
 * Nothing is deleted: the pointer moves, and the artifact that was live stays
 * where it is in case the rollback itself was the mistake.
 */
export async function rollbackSeed(
  deps: Deps,
  input: { seedId: string; toRevision: number; actorUid: string }
): Promise<PublishResult> {
  const revisionRef = deps.db
    .collection('seedRevisions')
    .doc(`${input.seedId}_${input.toRevision}`);
  const snapshot = await revisionRef.get();
  const data = snapshot.data();

  if (!snapshot.exists || data?.status !== 'published') {
    throw new PublishError('not-found');
  }

  // The revision document carries the whole catalogue summary, so a rollback
  // republishes exactly the record that revision was published with — no field
  // can drift out of step with the artifact it describes.
  const restored = parseManifest({
    seedId: data.seedId,
    revision: data.revision,
    storagePath: data.storagePath,
    checksum: data.checksum,
    bytes: data.bytes,
    schemaVersion: data.schemaVersion,
    publishedAt: data.publishedAt,
  });
  if (!restored.ok) {
    // A revision whose manifest cannot be reconstructed is not something to
    // point readers at; publishing it again is the fix, not rolling back to it.
    throw new PublishError('not-found', restored.issues);
  }

  await deps.db.collection('seeds').doc(input.seedId).set(
    {
      ...restored.value,
      // The summary too, not only the pointer: a rollback that moved the
      // manifest alone left the newer revision's title and topic on screen.
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
      ...(typeof data.objective === 'string' ? { objective: data.objective } : {}),
      ...(typeof data.topicId === 'string' ? { topicId: data.topicId } : {}),
      ...(typeof data.difficulty === 'number' ? { difficulty: data.difficulty } : {}),
      ...(typeof data.estimatedMinutes === 'number'
        ? { estimatedMinutes: data.estimatedMinutes }
        : {}),
      ...(typeof data.locale === 'string' ? { locale: data.locale } : {}),
      currentRevision: input.toRevision,
      rolledBackAt: deps.now().toISOString(),
      rolledBackBy: input.actorUid,
    },
    { merge: true }
  );

  return {
    seedId: input.seedId,
    revision: input.toRevision,
    checksum: restored.value.checksum,
    storagePath: restored.value.storagePath,
    bytes: restored.value.bytes,
    manifest: restored.value,
  };
}
