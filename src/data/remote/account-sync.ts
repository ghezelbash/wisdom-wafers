import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

import type {
  AccountPreferences,
  AccountSnapshot,
  SyncableProgress,
} from '@/domain/account/sync';

/**
 * The account, as Firestore holds it.
 *
 * Reads and writes only; the policy for reconciling the two sides is in
 * `@/domain/account/sync`, where it can be tested without a backend. What lives
 * here is the shape of the documents and nothing else.
 *
 * Progress is written server-side by `ingestProgress`, so this only reads it.
 * Preferences and bookmarks are the reader's own choices and are written
 * directly, within what the rules allow.
 */
export class AccountSync {
  constructor(private readonly db: Firestore) {}

  private user(uid: string) {
    return doc(this.db, 'users', uid);
  }

  /** Everything an account can give a device that has just signed in. */
  async pull(uid: string): Promise<AccountSnapshot> {
    const [profile, progress, saved, reviews] = await Promise.all([
      getDoc(this.user(uid)),
      getDocs(collection(this.db, `users/${uid}/progress`)),
      getDocs(collection(this.db, `users/${uid}/saved`)),
      getDocs(collection(this.db, `users/${uid}/reviews`)),
    ]);

    const profileData = profile.data() as Partial<AccountPreferences> | undefined;

    return {
      preferences: profileData
        ? {
            locale: profileData.locale ?? 'fa-IR',
            timezone: profileData.timezone ?? 'UTC',
            interests: profileData.interests ?? [],
            notificationPreferences: {
              pace: profileData.notificationPreferences?.pace ?? null,
              timeOfDay: profileData.notificationPreferences?.timeOfDay ?? null,
              reminderTime: profileData.notificationPreferences?.reminderTime ?? null,
              enabled: profileData.notificationPreferences?.enabled ?? false,
            },
            updatedAt: profileData.updatedAt ?? '1970-01-01T00:00:00.000Z',
          }
        : null,
      progress: progress.docs.map((document) => {
        const data = document.data();
        return {
          seedId: document.id,
          revision: (data.revision as number) ?? 1,
          blockIndex: (data.blockIndex as number) ?? 0,
          status: (data.status as SyncableProgress['status']) ?? 'in_progress',
          completedAt: data.completedAt as string | undefined,
          updatedAt: (data.updatedAt as string) ?? '1970-01-01T00:00:00.000Z',
        };
      }),
      saved: saved.docs.map((document) => document.id),
      reviews: reviews.docs.map((document) => {
        const data = document.data();
        return {
          seedId: (data.seedId as string) ?? document.id,
          reviewedAt: (data.reviewedAt as string) ?? '1970-01-01T00:00:00.000Z',
          interval: (data.interval as number) ?? 0,
          count: (data.count as number) ?? 0,
        };
      }),
    };
  }

  /**
   * Writes the reader's own choices.
   *
   * Only the keys the rules allow — a write carrying anything else is refused
   * whole, so the allow-list is enforced here rather than discovered in
   * production.
   */
  async pushPreferences(uid: string, preferences: AccountPreferences): Promise<void> {
    await setDoc(
      this.user(uid),
      {
        locale: preferences.locale,
        timezone: preferences.timezone,
        interests: preferences.interests.slice(0, 20),
        notificationPreferences: preferences.notificationPreferences,
        updatedAt: preferences.updatedAt,
      },
      { merge: true }
    );
  }

  /** Bookmarks, as a set. Unsaving has to travel too, so removals are explicit. */
  async pushSaved(uid: string, saved: string[], removed: string[] = []): Promise<void> {
    const batch = writeBatch(this.db);

    for (const seedId of saved) {
      batch.set(doc(this.db, `users/${uid}/saved/${seedId}`), {
        seedId,
        savedAt: new Date().toISOString(),
      });
    }
    for (const seedId of removed) {
      batch.delete(doc(this.db, `users/${uid}/saved/${seedId}`));
    }

    await batch.commit();
  }
}
