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
/** Whether the user finished the stepped onboarding (`'1'` = done). */
export const SETTING_ONBOARDED = 'onboarded';
/** Whether the user opted in to post-deploy "what's new" pushes (`'1'` = on). */
export const SETTING_FEATURE_ANNOUNCEMENTS = 'feature_announcements';
/**
 * The user's IANA timezone for reminders (Plan 025). Absent → the bot-global
 * default is used. Stored as a validated IANA name (e.g. `Europe/Belgrade`).
 */
export const SETTING_TIMEZONE = 'timezone';

interface UserRow {
  id: number;
  username: string | null;
  active: number;
}

/** Full user record including the version-broadcast bookkeeping column. */
export interface UserRecord {
  id: number;
  username: string | null;
  active: number;
  notified_version: string | null;
}

/**
 * Resolve the internal user id for a Telegram user, creating the `users` and
 * `auth_identities` rows on first contact. Idempotent: subsequent calls update
 * `last_seen_at`, refresh the username, and re-activate a user who had been
 * flipped inactive by a permanent send failure.
 */
export function ensureUser(
  externalId: string,
  username: string | null,
  now: number = Date.now(),
): UserId {
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

/** Read a full user record by internal id. Returns `undefined` if unknown. */
export function getUserById(userId: UserId): UserRecord | undefined {
  return getDb()
    .prepare('SELECT id, username, active, notified_version FROM users WHERE id = ?')
    .get(userId) as UserRecord | undefined;
}

// ─── version broadcast (plan 010) ──────────────────────────────────────────

/**
 * A candidate row for the version-announcer multi-message queue. Carries the
 * opt-in flag per row so the announcer decides locally whether a priority
 * entry overrides the user's `feature_announcements` preference, without a
 * second query.
 */
export interface VersionCandidate {
  id: number;
  notifiedVersion: string | null;
  optedIn: boolean;
}

/**
 * Active users whose `notified_version` is stale relative to `currentVersion`.
 * LEFT JOIN keeps opted-out and no-row users in the result so priority
 * announcements can still reach them; the announcer applies the per-row
 * `optedIn` filter for non-priority entries. Inactive users are filtered out —
 * their chats are dead (a permanent send failure flipped `active = 0`).
 */
export function findActiveUsersBehindCurrentVersion(currentVersion: string): VersionCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id AS id,
              u.notified_version AS notified_version,
              CASE WHEN s.value = '1' THEN 1 ELSE 0 END AS opted_in
         FROM users u
         LEFT JOIN user_settings s
           ON s.user_id = u.id AND s.key = ?
        WHERE u.active = 1
          AND (u.notified_version IS NULL OR u.notified_version != ?)`,
    )
    .all(SETTING_FEATURE_ANNOUNCEMENTS, currentVersion) as {
    id: number;
    notified_version: string | null;
    opted_in: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    notifiedVersion: r.notified_version,
    optedIn: r.opted_in === 1,
  }));
}

/** Advance a user's broadcast watermark to `version` (idempotency key). */
export function markNotified(userId: UserId, version: string): void {
  getDb().prepare('UPDATE users SET notified_version = ? WHERE id = ?').run(version, userId);
}

/**
 * Strict opt-in: only an explicit `'1'` is enabled. Absent row and explicit
 * `'0'` both read as disabled — the version-announcer JOIN relies on the same
 * equivalence.
 */
export function getFeatureAnnouncementsEnabled(userId: UserId): boolean {
  return getSetting(userId, SETTING_FEATURE_ANNOUNCEMENTS) === '1';
}

export function getSetting(userId: UserId, key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
    .get(userId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * The user's effective reminder timezone (Plan 025): their stored `timezone`
 * setting, or `fallback` (the bot-global default) when unset. A stored value is
 * validated on write, but we still guard against a corrupt row here so the
 * dispatch loop never throws — an unparseable zone falls back rather than
 * crashing the tick.
 */
export function getUserTimezone(userId: UserId, fallback: string): string {
  const stored = getSetting(userId, SETTING_TIMEZONE);
  if (stored === null) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: stored });
    return stored;
  } catch {
    return fallback;
  }
}

export function setSetting(userId: UserId, key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    )
    .run(userId, key, value);
}
