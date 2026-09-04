/**
 * The narrow SQL surface the local store needs.
 *
 * Keeping it this small is what lets the same schema, migrations and queries
 * run against `expo-sqlite` on a device and Node's built-in SQLite in tests —
 * so the SQL itself is genuinely exercised rather than mocked.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Rolls back on throw; nested calls are the caller's problem to avoid. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
