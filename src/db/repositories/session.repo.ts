/**
 * Low-level CRUD for `bot_sessions`. The bot-layer wrappers and the
 * `SessionKind` type live in `src/bot/session-store.ts`; this repo is the
 * SQLite boundary (ADR 003 keeps DB access out of the bot adapter).
 */

import { getDb } from '../connection';

export function saveSessionRow(userId: number, kind: string, data: string, expiresAt: number): void {
  getDb()
    .prepare(
      `INSERT INTO bot_sessions (user_id, kind, data, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, kind) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
    )
    .run(userId, kind, data, expiresAt);
}

/** Returns the stored JSON string, or null if absent or expired. */
export function loadSessionRow(userId: number, kind: string, now: number = Date.now()): string | null {
  const row = getDb()
    .prepare('SELECT data, expires_at FROM bot_sessions WHERE user_id = ? AND kind = ?')
    .get(userId, kind) as { data: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    deleteSessionRow(userId, kind);
    return null;
  }
  return row.data;
}

export function deleteSessionRow(userId: number, kind: string): void {
  getDb().prepare('DELETE FROM bot_sessions WHERE user_id = ? AND kind = ?').run(userId, kind);
}

export function deleteExpiredSessionRows(now: number = Date.now()): number {
  const result = getDb().prepare('DELETE FROM bot_sessions WHERE expires_at <= ?').run(now);
  return result.changes;
}
