import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

import { PREFERENCE_KEYS, type SavedDoc } from '@dananeh/content-schema';

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
      // A removal is a document that says `saved: false`, not an absent one —
      // a deleted row says nothing to a device that never saw it exist.
      saved: saved.docs.map((document) => {
        const data = document.data();
        return {
          seedId: (data.seedId as string) ?? document.id,
          saved: data.saved !== false,
          updatedAt: (data.updatedAt as string) ?? '1970-01-01T00:00:00.000Z',
        } satisfies SavedDoc;
      }),
      reviews: reviews.docs.map((document) => {
        const data = document.data();
        return {
          seedId: (data.seedId as string) ?? document.id,
          reviewedAt: (data.reviewedAt as string) ?? '1970-01-01T00:00:00.000Z',
          interval: (data.interval as number) ?? 0,
          dueAt: (data.dueAt as string) ?? undefined,
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
    const payload: Record<string, unknown> = {
      locale: preferences.locale,
      timezone: preferences.timezone,
      interests: preferences.interests.slice(0, 20),
      notificationPreferences: preferences.notificationPreferences,
      updatedAt: preferences.updatedAt,
    };

    // The rules refuse a write carrying any key outside the allow-list, and
    // they refuse it *whole*. Enforcing the list here keeps that from being
    // discovered in production as "preferences silently stop syncing".
    for (const key of Object.keys(payload)) {
      if (!(PREFERENCE_KEYS as readonly string[]).includes(key)) delete payload[key];
    }

    await setDoc(this.user(uid), payload, { merge: true });
  }

  /**
   * Bookmarks, including the ones that were taken away.
   *
   * A removal is written as `saved: false` rather than deleted: an absent
   * document is indistinguishable from one a device has never seen, so
   * deleting would make un-saving silently fail to reach a second device.
   */
  async pushSaved(uid: string, entries: SavedDoc[]): Promise<void> {
    if (!entries.length) return;

    const batch = writeBatch(this.db);
    for (const entry of entries) {
      batch.set(doc(this.db, `users/${uid}/saved/${entry.seedId}`), entry);
    }
    await batch.commit();
  }
}
