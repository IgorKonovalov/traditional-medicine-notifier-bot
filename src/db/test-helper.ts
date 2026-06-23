/**
 * In-memory SQLite test harness.
 *
 * Tests call `setupTestDb()` in `beforeEach` and `teardownTestDb()` in
 * `afterEach`. The helper installs the in-memory connection as the singleton,
 * so repository functions that use `getDb()` work transparently. No DB mocks.
 */

import Database from 'better-sqlite3';

import { closeDb, setDb } from './connection';
import { runMigrations } from './schema';

export function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  setDb(db);
  return db;
}

export function teardownTestDb(): void {
  closeDb();
}
