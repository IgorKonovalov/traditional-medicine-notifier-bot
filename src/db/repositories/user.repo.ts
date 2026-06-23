/**
 * User identity + per-user settings.
 *
 * Per ADR 003 rule 1, `users.id` is the internal primary key and the Telegram
 * id is stored as `auth_identities.external_id` (TEXT). `ensureUser` resolves
 * (or creates) the internal id for an incoming Telegram user and is the only
 * place the bot layer touches identity.
 *
 * Settings are a typed kv store. Well-known keys are exported as constants so
 * callers never hand-type a string.
 */

import { getDb } from '../connection';

export type UserId = number;

export const PROVIDER_TELEGRAM = 'telegram';

/** Last calendar date (YYYY-MM-DD) a proactive push was delivered. Daily cap. */
export const SETTING_LAST_PROACTIVE_PUSH = 'last_proactive_push_date';
/** Whether the user opted in to the daily tip (`'1'` = on). */
export const SETTING_DAILY_TIP = 'daily_tip';

interface UserRow {
  id: number;
  username: string | null;
  active: number;
}

/**
 * Resolve the internal user id for a Telegram user, creating the `users` and
 * `auth_identities` rows on first contact. Idempotent: subsequent calls update
 * `last_seen_at`, refresh the username, and re-activate a user who had been
 * flipped inactive by a permanent send failure.
 */
export function ensureUser(externalId: string, username: string | null, now: number = Date.now()): UserId {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT u.id AS id, u.username AS username, u.active AS active
         FROM auth_identities a
         JOIN users u ON u.id = a.user_id
        WHERE a.provider = ? AND a.external_id = ?`,
    )
    .get(PROVIDER_TELEGRAM, externalId) as UserRow | undefined;

  if (existing) {
    db.prepare('UPDATE users SET last_seen_at = ?, username = ?, active = 1 WHERE id = ?').run(
      now,
      username,
      existing.id,
    );
    return existing.id;
  }

  const insertUser = db
    .prepare('INSERT INTO users (username, created_at, last_seen_at) VALUES (?, ?, ?)')
    .run(username, now, now);
  const userId = Number(insertUser.lastInsertRowid);
  db.prepare(
    'INSERT INTO auth_identities (provider, external_id, user_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(PROVIDER_TELEGRAM, externalId, userId, now);
  return userId;
}

/** Flip a user inactive — called when a send permanently fails (blocked bot). */
export function markInactive(userId: UserId): void {
  getDb().prepare('UPDATE users SET active = 0 WHERE id = ?').run(userId);
}

/** Internal user ids that are still active — the audience for proactive pushes. */
export function listActiveUserIds(): UserId[] {
  const rows = getDb().prepare('SELECT id FROM users WHERE active = 1').all() as { id: number }[];
  return rows.map((r) => r.id);
}

/** Resolve the Telegram chat id (external_id) for an internal user id. */
export function getTelegramId(userId: UserId): string | null {
  const row = getDb()
    .prepare('SELECT external_id FROM auth_identities WHERE provider = ? AND user_id = ?')
    .get(PROVIDER_TELEGRAM, userId) as { external_id: string } | undefined;
  return row?.external_id ?? null;
}

export function getSetting(userId: UserId, key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
    .get(userId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(userId: UserId, key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    )
    .run(userId, key, value);
}
