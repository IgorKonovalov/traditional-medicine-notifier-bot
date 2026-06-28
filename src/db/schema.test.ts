/**
 * Migration tests — focused on migration 002 (`notified_version` column +
 * backfill, plan 010). Verifies the column is added, the backfill pins
 * pre-existing rows to the current version (so a deploy does not retro-ping
 * them), and that `runMigrations` is idempotent.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from './test-helper';
import { runMigrations } from './schema';
import { getVersion } from '../utils/version';

function schemaVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

function columnNames(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe('runMigrations', () => {
  afterEach(() => {
    teardownTestDb();
  });

  it('migrates a fresh DB to the latest version with notified_version present', () => {
    const db = setupTestDb();
    expect(schemaVersion(db)).toBe(2);
    expect(columnNames(db, 'users')).toContain('notified_version');
  });

  it('is idempotent — re-running on an up-to-date DB is a no-op', () => {
    const db = setupTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(() => runMigrations(db)).not.toThrow();
    expect(schemaVersion(db)).toBe(2);
  });
});

describe('migration 002 backfill', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Reconstruct the post-migration-001 state by hand: a `users` table (only
    // the columns migration 001 creates) and a schema_version seeded to 1.
    // Then `runMigrations` runs migration 002 alone against pre-existing rows,
    // which is exactly the production deploy path we want to assert.
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT,
        created_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO schema_version (version) VALUES (1);
      INSERT INTO users (username, created_at, last_seen_at) VALUES ('alice', 1, 1);
      INSERT INTO users (username, created_at, last_seen_at) VALUES ('bob', 2, 2);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('backfills every pre-existing row to the current version', () => {
    runMigrations(db);
    const rows = db.prepare('SELECT notified_version FROM users ORDER BY id').all() as {
      notified_version: string | null;
    }[];
    expect(rows).toEqual([{ notified_version: getVersion() }, { notified_version: getVersion() }]);
    expect(schemaVersion(db)).toBe(2);
  });
});
