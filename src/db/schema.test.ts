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
    expect(schemaVersion(db)).toBe(3);
    expect(columnNames(db, 'users')).toContain('notified_version');
  });

  it('adds the formula link + intake columns on scheduled_reminders (migration 003)', () => {
    const db = setupTestDb();
    const cols = columnNames(db, 'scheduled_reminders');
    expect(cols).toContain('combination_id');
    expect(cols).toContain('intake_type');
  });

  it('is idempotent — re-running on an up-to-date DB is a no-op', () => {
    const db = setupTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    expect(() => runMigrations(db)).not.toThrow();
    expect(schemaVersion(db)).toBe(3);
  });
});

describe('migration 003 upgrade from v2', () => {
  let db: Database.Database;

  afterEach(() => {
    db.close();
  });

  it('upgrades an existing v2 DB cleanly, adding the new columns to existing rows', () => {
    // Reconstruct a post-migration-002 state: the v1 scheduled_reminders table
    // (no link/intake columns) with a row, schema_version pinned to 2. Then
    // runMigrations runs migration 003 alone — the production upgrade path.
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      CREATE TABLE scheduled_reminders (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL,
        label         TEXT NOT NULL,
        herb_id       TEXT,
        recurrence    TEXT NOT NULL,
        next_fire_at  INTEGER NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    INTEGER NOT NULL
      );
      INSERT INTO schema_version (version) VALUES (2);
      INSERT INTO scheduled_reminders (user_id, label, herb_id, recurrence, next_fire_at, created_at)
        VALUES (1, 'legacy', NULL, '{"kind":"once"}', 1000, 1);
    `);

    runMigrations(db);

    expect(schemaVersion(db)).toBe(3);
    const cols = columnNames(db, 'scheduled_reminders');
    expect(cols).toContain('combination_id');
    expect(cols).toContain('intake_type');
    const row = db
      .prepare('SELECT combination_id, intake_type FROM scheduled_reminders WHERE label = ?')
      .get('legacy') as { combination_id: string | null; intake_type: string | null };
    expect(row.combination_id).toBeNull();
    expect(row.intake_type).toBeNull();
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
      CREATE TABLE scheduled_reminders (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL,
        label         TEXT NOT NULL,
        herb_id       TEXT,
        recurrence    TEXT NOT NULL,
        next_fire_at  INTEGER NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    INTEGER NOT NULL
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
    expect(schemaVersion(db)).toBe(3);
  });
});
