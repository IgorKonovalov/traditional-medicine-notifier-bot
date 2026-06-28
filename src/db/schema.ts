/**
 * Versioned, additive-only migrations.
 *
 * Each migration is a numbered, idempotent function. The current schema
 * version is tracked in the `schema_version` table. `runMigrations()` walks
 * from the highest applied version to `LATEST_VERSION`, applying each step
 * inside a transaction.
 *
 * Adding a new migration:
 *   1. Add a new `migration00N` function below.
 *   2. Append it to `MIGRATIONS`.
 *   3. Bump `LATEST_VERSION`.
 *   4. Never edit a migration that has shipped — write a new one instead.
 */

import type Database from 'better-sqlite3';

import { getVersion } from '../utils/version';

type MigrationFn = (db: Database.Database) => void;

const LATEST_VERSION = 2;

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const currentVersion = getCurrentVersion(db);

  for (let v = currentVersion + 1; v <= LATEST_VERSION; v++) {
    const migration = MIGRATIONS[v - 1];
    if (!migration) {
      throw new Error(`Missing migration for version ${v}`);
    }
    const apply = db.transaction(() => {
      migration(db);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v);
    });
    apply();
  }
}

function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

/**
 * Migration 001 — initial skeleton schema.
 *
 * Tables:
 *   users                — internal user identity (no provider data here)
 *   auth_identities      — provider mapping (telegram | future ios/android)
 *   user_settings        — typed kv store keyed by user
 *   scheduled_reminders  — user-created recurring reminders (SOLICITED path)
 *   subscriptions        — per-user topic/category subscriptions (PROACTIVE)
 *   notification_log     — append-only delivery history; powers the daily cap
 *   bot_sessions         — session persistence across restarts
 *   donations            — voluntary Telegram Stars tips
 *
 * Per the portability discipline (ADR 003 rule 1), `users.id` is the internal
 * primary key; the Telegram id lives in `auth_identities.external_id` (TEXT),
 * never as a PK.
 */
const migration001: MigrationFn = (db) => {
  db.exec(`
    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE auth_identities (
      provider      TEXT NOT NULL,
      external_id   TEXT NOT NULL,
      user_id       INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      PRIMARY KEY (provider, external_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_auth_identities_user_id ON auth_identities(user_id);

    CREATE TABLE user_settings (
      user_id   INTEGER NOT NULL,
      key       TEXT NOT NULL,
      value     TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- SOLICITED notifications: user-created reminders. \`recurrence\` is a JSON
    -- blob (see notifications/types.ts → RecurrenceSpec). \`herb_id\` optionally
    -- links the reminder to a content herb (nullable). \`next_fire_at\` is the
    -- epoch-ms of the next due delivery; the dispatch tick advances it.
    CREATE TABLE scheduled_reminders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      label         TEXT NOT NULL,
      herb_id       TEXT,
      recurrence    TEXT NOT NULL,
      next_fire_at  INTEGER NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_reminders_due ON scheduled_reminders(active, next_fire_at);
    CREATE INDEX idx_reminders_user ON scheduled_reminders(user_id);

    -- PROACTIVE notifications: topic/category subscriptions. One row per
    -- (user, category). The topic-subscriptions UI was retired in Plan 011;
    -- this v1 baseline table is retained (dead, harmless) under the
    -- additive-only migration rule.
    CREATE TABLE subscriptions (
      user_id     INTEGER NOT NULL,
      category    TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, category),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Append-only delivery log. \`kind\` is the NotificationKind. Powers the
    -- ≤1-proactive-push-per-day budget gate and future analytics.
    CREATE TABLE notification_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL,
      kind      TEXT NOT NULL,
      sent_at   INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_notification_log_user_time ON notification_log(user_id, sent_at);

    CREATE TABLE bot_sessions (
      user_id     INTEGER NOT NULL,
      kind        TEXT NOT NULL,
      data        TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind)
    );
    CREATE INDEX idx_bot_sessions_expires ON bot_sessions(expires_at);

    -- Voluntary Telegram Stars tips. Append-only; one row per successful
    -- payment. \`telegram_charge_id\` is unique so a redelivered
    -- successful_payment can't double-record (insert via ON CONFLICT DO NOTHING).
    CREATE TABLE donations (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                     INTEGER NOT NULL,
      stars_amount                INTEGER NOT NULL,
      telegram_charge_id          TEXT NOT NULL,
      provider_payment_charge_id  TEXT,
      created_at                  INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_donations_user_id ON donations(user_id);
    CREATE UNIQUE INDEX idx_donations_charge_id ON donations(telegram_charge_id);
  `);
};

/**
 * Migration 002 — `notified_version` column on `users` for the post-deploy
 * version-broadcast loop (plan 010). Existing rows are backfilled to the
 * **current** `getVersion()` so the deploy that ships this migration does
 * **not** retro-ping them; they only start receiving "what's new" pushes from
 * the next minor/major bump onward (the announcer compares against this
 * baseline).
 *
 * New users created after the migration keep `notified_version = NULL` until
 * the announcer marks them — `classifyDelta(null, …)` treats them as behind,
 * but with the map empty / opt-in off they are simply marked current with no
 * send. Reading `getVersion()` in the migration body is safe: `utils/version`
 * is dependency-free.
 */
const migration002: MigrationFn = (db) => {
  db.exec(`ALTER TABLE users ADD COLUMN notified_version TEXT;`);
  db.prepare('UPDATE users SET notified_version = ?').run(getVersion());
};

const MIGRATIONS: readonly MigrationFn[] = [migration001, migration002];
