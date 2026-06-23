/**
 * SQLite connection singleton.
 *
 * Boot calls `initDb(path)` once. All other modules go through `getDb()`.
 * Tests use `setDb()` from `test-helper.ts` to swap in an in-memory instance.
 *
 * No module may `import Database from 'better-sqlite3'` outside this file and
 * the test helper.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { runMigrations } from './schema';

let dbInstance: Database.Database | null = null;

export function initDb(path: string): Database.Database {
  if (dbInstance !== null) {
    throw new Error('Database already initialized — call closeDb() before re-initializing');
  }
  // better-sqlite3 won't create the parent directory itself.
  const parent = dirname(path);
  if (parent && parent !== '.' && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Tolerate concurrent writers: a cron tick (dispatch/backup) overlapping a
  // command write would otherwise throw SQLITE_BUSY immediately. Wait up to 5s
  // for the lock instead. `synchronous = NORMAL` is the recommended pairing
  // with WAL.
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function getDb(): Database.Database {
  if (dbInstance === null) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return dbInstance;
}

/**
 * Test-only escape hatch. Production code uses `initDb()` exclusively.
 * Exported so `test-helper.ts` can install an in-memory connection.
 */
export function setDb(db: Database.Database): void {
  dbInstance = db;
}

export function closeDb(): void {
  if (dbInstance !== null) {
    dbInstance.close();
    dbInstance = null;
  }
}
