import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * The services the handlers need, injected rather than imported.
 *
 * Every piece of logic in here takes `Deps`, so the same code runs in a
 * function, in a test against the emulator, and in a local publish script —
 * without any of them reaching for a global.
 */
export interface Deps {
  db: Firestore;
  /** Writes a published artifact and returns the path it can be read from. */
  putObject(path: string, body: string, contentType: string): Promise<string>;
  /** Removes everything under a prefix; returns how many objects went. */
  deleteObjects(prefix: string): Promise<number>;
  /** Removes an Auth record. Tolerates one that is already gone. */
  deleteAuthUser(uid: string): Promise<void>;
  now(): Date;
}

let app = getApps()[0];

export function defaultDeps(bucketName?: string): Deps {
  if (!app) app = initializeApp();

  const bucket = getStorage(app).bucket(bucketName);

  return {
    db: getFirestore(app),
    async putObject(path, body, contentType) {
      await bucket.file(path).save(body, {
        contentType,
        // Published artifacts are immutable: one revision, one object, cached
        // hard. A correction is a new revision, never an overwrite.
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      });
      return `${bucket.name}/${path}`;
    },
    async deleteObjects(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
      return files.length;
    },
    async deleteAuthUser(uid) {
      try {
        await getAuth(app).deleteUser(uid);
      } catch (error) {
        // Already gone is the state we wanted; anything else is a real failure.
        if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error;
      }
    },
    now: () => new Date(),
  };
}
