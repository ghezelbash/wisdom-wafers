import AsyncStorage from '@react-native-async-storage/async-storage';

import { getLocalDriver } from '@/data/local/expo-driver';
import * as local from '@/data/local/local-store';

/**
 * On-device progress.
 *
 * Every block change is written through, so closing a seed is free — there is
 * no confirmation dialog, because there is nothing to lose. Reflections live
 * here and only here: they are private, never scored and never sent.
 */
export interface BlockAnswer {
  blockId: string;
  /** Fully correct. Partial credit is its own state, not a rounded-down pass. */
  correct: boolean;
  partial?: boolean;
  attempts: number;
  selected?: string[];
  order?: string[];
  pairs?: Record<string, string>;
  answeredBool?: boolean;
}

export interface SeedProgress {
  seedId: string;
  /** Content revision this progress belongs to; a newer revision resets it. */
  revision: number;
  blockIndex: number;
  answers: Record<string, BlockAnswer>;
  /** Optional, private, on-device only. */
  reflection?: string;
  saved?: boolean;
  completedAt?: string;
  /** Last review pass, the interval it produced, and how many passes so far. */
  reviewedAt?: string;
  reviewInterval?: number;
  reviewCount?: number;
  updatedAt: string;
}

const KEY_PREFIX = 'dananeh.progress.v1.';
const INDEX_KEY = 'dananeh.progress.index.v1';
const MIGRATED_KEY = 'dananeh.progress.migratedToSqlite.v1';

/**
 * Two backends, one API.
 *
 * SQLite on device, key-value everywhere else. The switch lives here so no
 * caller — and no screen — has to know which one is in use.
 */
async function sqlBackend() {
  const driver = await getLocalDriver();
  if (!driver) return null;
  await local.open(driver);
  await migrateFromKeyValue(driver);
  return driver;
}

const toStored = (progress: SeedProgress): local.StoredProgress => ({
  seedId: progress.seedId,
  revision: progress.revision,
  blockIndex: progress.blockIndex,
  status: progress.completedAt ? 'completed' : 'in_progress',
  saved: !!progress.saved,
  answers: progress.answers,
  reflection: progress.reflection,
  completedAt: progress.completedAt,
  reviewedAt: progress.reviewedAt,
  reviewInterval: progress.reviewInterval,
  reviewCount: progress.reviewCount ?? 0,
  updatedAt: progress.updatedAt,
});

const fromStored = (stored: local.StoredProgress): SeedProgress => ({
  seedId: stored.seedId,
  revision: stored.revision,
  blockIndex: stored.blockIndex,
  answers: stored.answers as Record<string, BlockAnswer>,
  reflection: stored.reflection,
  saved: stored.saved,
  completedAt: stored.completedAt,
  reviewedAt: stored.reviewedAt,
  reviewInterval: stored.reviewInterval,
  reviewCount: stored.reviewCount,
  updatedAt: stored.updatedAt,
});

/**
 * Carries an existing device's progress into SQLite, once.
 *
 * A reader who has finished seeds must not lose them to a storage change; the
 * key-value copy is left in place for one release as a fallback.
 */
async function migrateFromKeyValue(driver: Awaited<ReturnType<typeof getLocalDriver>>) {
  if (!driver) return;
  try {
    if (await AsyncStorage.getItem(MIGRATED_KEY)) return;

    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];

    for (const id of ids) {
      const stored = await AsyncStorage.getItem(KEY_PREFIX + id);
      if (!stored) continue;
      await local.saveProgress(driver, toStored(JSON.parse(stored) as SeedProgress));
    }

    await AsyncStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch {
    // A failed migration must not block the app; the key-value path still works
    // and the next launch tries again.
  }
}

export function emptyProgress(seedId: string, revision: number): SeedProgress {
  return {
    seedId,
    revision,
    blockIndex: 0,
    answers: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function loadProgress(seedId: string, revision: number): Promise<SeedProgress> {
  const driver = await sqlBackend();
  if (driver) {
    const stored = await local.getProgress(driver, seedId);
    if (!stored) return emptyProgress(seedId, revision);
    // The seed was edited since this reader last opened it: answers no longer
    // line up with blocks, so start clean rather than mis-map them.
    return stored.revision === revision ? fromStored(stored) : emptyProgress(seedId, revision);
  }

  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + seedId);
    if (!raw) return emptyProgress(seedId, revision);
    const parsed = JSON.parse(raw) as SeedProgress;
    // The seed was edited since this reader last opened it: answers no longer
    // line up with blocks, so start clean rather than mis-map them.
    if (parsed.revision !== revision) return emptyProgress(seedId, revision);
    return parsed;
  } catch {
    return emptyProgress(seedId, revision);
  }
}

export async function saveProgress(progress: SeedProgress): Promise<void> {
  const next = { ...progress, updatedAt: new Date().toISOString() };

  const driver = await sqlBackend();
  if (driver) {
    await local.saveProgress(driver, toStored(next));
    return;
  }

  try {
    await AsyncStorage.setItem(KEY_PREFIX + next.seedId, JSON.stringify(next));
    await addToIndex(next.seedId);
  } catch {
    // A failed write costs this reader their place in one seed, never data
    // they typed elsewhere. Losing it silently is better than an error dialog
    // in the middle of reading.
  }
}

async function addToIndex(seedId: string) {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(seedId)) {
    ids.push(seedId);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  }
}

/** Every seed this device has state for — Garden reads this. */
export async function listProgress(): Promise<SeedProgress[]> {
  const driver = await sqlBackend();
  if (driver) {
    return (await local.listProgress(driver)).map(fromStored);
  }

  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const entries = await Promise.all(ids.map((id) => AsyncStorage.getItem(KEY_PREFIX + id)));
    return entries
      .map((value) => (value ? (JSON.parse(value) as SeedProgress) : null))
      .filter((value): value is SeedProgress => !!value);
  } catch {
    return [];
  }
}

export async function clearProgress(seedId: string): Promise<void> {
  const driver = await sqlBackend();
  if (driver) {
    // Both backends, not just the key-value one: clearing only half of it left
    // deleted progress alive on device and reappearing on the next launch.
    await local.deleteProgress(driver, seedId);
  }

  try {
    await AsyncStorage.removeItem(KEY_PREFIX + seedId);
  } catch {
    // Nothing to recover: the caller is discarding this state anyway.
  }
}

/**
 * Erases every trace of what this device has read.
 *
 * Used by account deletion, where "deleted" has to mean deleted — including
 * the key-value copies the SQLite migration deliberately left behind.
 */
export async function clearAllProgress(): Promise<void> {
  const driver = await sqlBackend();
  if (driver) await local.deleteAllProgress(driver);

  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    for (const key of [...ids.map((id) => KEY_PREFIX + id), INDEX_KEY, MIGRATED_KEY]) {
      await AsyncStorage.removeItem(key);
    }
  } catch {
    // The SQLite delete above is the authoritative one on device.
  }
}
