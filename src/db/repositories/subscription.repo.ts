/**
 * Persistence for per-user topic subscriptions (the PROACTIVE notification
 * path). One row per (user, category). The daily-tip dispatch reads the
 * subscriber list per category.
 */

import { getDb } from '../connection';
import type { Subscription } from '../../notifications/types';

interface SubscriptionRow {
  user_id: number;
  category: string;
  created_at: number;
}

export function subscribe(userId: number, category: string, now: number = Date.now()): void {
  getDb()
    .prepare(
      `INSERT INTO subscriptions (user_id, category, created_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id, category) DO NOTHING`,
    )
    .run(userId, category, now);
}

export function unsubscribe(userId: number, category: string): void {
  getDb().prepare('DELETE FROM subscriptions WHERE user_id = ? AND category = ?').run(userId, category);
}

export function listUserSubscriptions(userId: number): Subscription[] {
  const rows = getDb()
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY category')
    .all(userId) as SubscriptionRow[];
  return rows.map((r) => ({ userId: r.user_id, category: r.category, createdAt: r.created_at }));
}

/** Internal user ids subscribed to a category. Restricted to active users. */
export function listSubscribers(category: string): number[] {
  const rows = getDb()
    .prepare(
      `SELECT s.user_id AS user_id
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
        WHERE s.category = ? AND u.active = 1`,
    )
    .all(category) as { user_id: number }[];
  return rows.map((r) => r.user_id);
}
