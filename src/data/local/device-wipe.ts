import AsyncStorage from '@react-native-async-storage/async-storage';

import { getLocalDriver } from './expo-driver';
import * as local from './local-store';
import { bundleFileName, getBundleFiles } from './bundle-files';
import { CATALOG_KEY } from './device-catalog';
import { OUTBOX_KEY } from './outbox-store';
import { INSTALL_ID_KEY, __resetCorrelation } from '@/platform/analytics/correlation';

/**
 * Erasing everything this device holds.
 *
 * "Deleted" has to mean deleted, which means all three backings: the SQLite
 * tables, the downloaded bundle files, and every key-value document — including
 * the ones the SQLite migration deliberately left behind as a fallback.
 *
 * It is deliberately tolerant. A device where one of these is unavailable still
 * gets the rest wiped; refusing to delete anything because a file could not be
 * removed would be the worse outcome.
 */

/** Every key-value document the app owns. Kept here so nothing is forgotten. */
export const OWNED_KEYS = [
  'dananeh.session.v1',
  'dananeh.localIdentity.v1',
  'dananeh.progress.index.v1',
  'dananeh.progress.migratedToSqlite.v1',
  'dananeh.catalog.lastSynced.v1',
  'dananeh.catalog.v1',
  CATALOG_KEY,
  'dananeh.outbox.v1',
  OUTBOX_KEY,
  // The telemetry install id describes this installation's data, so it must
  // not outlive it: a reader who deletes their account and starts again is a
  // new installation, not the same one continuing.
  INSTALL_ID_KEY,
];

const OWNED_PREFIXES = ['dananeh.progress.v1.', 'dananeh.bundle.'];

export interface WipeReport {
  tablesCleared: number;
  filesRemoved: number;
  keysRemoved: number;
}

/** Tables that hold the reader's own record. Content can simply be fetched again. */
const TABLES = [
  'progress_local',
  'outbox',
  'download',
  'catalog_seed',
  'search_token',
  'seed_manifest',
  'catalog_sync',
];

export async function wipeDevice(): Promise<WipeReport> {
  const report: WipeReport = { tablesCleared: 0, filesRemoved: 0, keysRemoved: 0 };

  // The cached copy would otherwise be written straight back on the next event.
  __resetCorrelation();

  const driver = await getLocalDriver().catch(() => null);

  // Read the manifests first: they name the files on disk, and the tables that
  // hold them are about to be emptied.
  const manifests = driver
    ? await local
        .open(driver)
        .then(() => local.listManifests(driver))
        .catch(() => [])
    : [];

  if (driver) {
    for (const table of TABLES) {
      try {
        await driver.run(`DELETE FROM ${table}`);
        report.tablesCleared += 1;
      } catch {
        // A table this build does not have is not a failure to wipe.
      }
    }
  }

  const files = await getBundleFiles().catch(() => null);
  if (files) {
    for (const manifest of manifests) {
      try {
        await files.remove(bundleFileName(manifest));
        report.filesRemoved += 1;
      } catch {
        // Best effort; the row it belonged to is already gone.
      }
    }
  }

  for (const key of await ownedKeys()) {
    try {
      await AsyncStorage.removeItem(key);
      report.keysRemoved += 1;
    } catch {
      // Nothing to recover: the caller is discarding this state anyway.
    }
  }

  return report;
}

async function ownedKeys(): Promise<string[]> {
  const keys = new Set(OWNED_KEYS);

  try {
    for (const key of await AsyncStorage.getAllKeys()) {
      if (OWNED_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key);
    }
  } catch {
    // Without enumeration the fixed list above still covers the named documents.
  }

  return [...keys];
}
