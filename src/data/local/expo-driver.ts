import { Platform } from 'react-native';

import type { SqlDriver } from './sql';

/**
 * The device's SQLite driver.
 *
 * Native only. On web the app keeps its key-value backend: the wasm build needs
 * cross-origin isolation headers, and web is a development surface here, not a
 * shipping target. Both backends implement the same store API, so nothing above
 * this file knows which one it is talking to.
 */
let driverPromise: Promise<SqlDriver | null> | null = null;

async function create(): Promise<SqlDriver | null> {
  if (Platform.OS === 'web') return null;

  try {
    const sqlite = await import('expo-sqlite');
    const db = await sqlite.openDatabaseAsync('dananeh.db');

    return {
      async exec(sql) {
        await db.execAsync(sql);
      },
      async run(sql, params = []) {
        await db.runAsync(sql, params as never[]);
      },
      async all<T>(sql: string, params: unknown[] = []) {
        return (await db.getAllAsync(sql, params as never[])) as T[];
      },
      async transaction<T>(work: () => Promise<T>) {
        // `withTransactionAsync` returns void, so the result is captured from
        // the closure rather than its return value.
        let result: T;
        await db.withTransactionAsync(async () => {
          result = await work();
        });
        return result!;
      },
      async close() {
        await db.closeAsync();
      },
    };
  } catch {
    // A device that cannot open the database still gets the key-value backend
    // rather than a broken app.
    return null;
  }
}

export function getLocalDriver(): Promise<SqlDriver | null> {
  if (!driverPromise) driverPromise = create();
  return driverPromise;
}
