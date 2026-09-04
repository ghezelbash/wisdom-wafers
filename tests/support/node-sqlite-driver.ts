import { DatabaseSync } from 'node:sqlite';

import type { SqlDriver } from '../../src/data/local/sql';

/**
 * Node's built-in SQLite behind the same driver interface the device uses.
 *
 * The point is that migrations and queries are executed for real in tests —
 * a mocked driver would only prove the code calls itself.
 */
export function nodeSqliteDriver(file = ':memory:'): SqlDriver {
  const db = new DatabaseSync(file);

  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async transaction<T>(work: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const result = await work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}
