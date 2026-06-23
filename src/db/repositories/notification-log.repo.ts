/**
 * Append-only delivery log. Records every notification the bot sends, keyed by
 * internal user id and `NotificationKind`. Powers the proactive daily-cap gate
 * (`services/notification-budget.ts`) and future analytics.
 */

import { getDb } from '../connection';
import type { NotificationKind } from '../../notifications/types';

export function logNotification(
  userId: number,
  kind: NotificationKind,
  sentAt: number = Date.now(),
): void {
  getDb()
    .prepare('INSERT INTO notification_log (user_id, kind, sent_at) VALUES (?, ?, ?)')
    .run(userId, kind, sentAt);
}

/** How many notifications of any kind were sent to a user in [from, to). */
export function countSentBetween(userId: number, from: number, to: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM notification_log WHERE user_id = ? AND sent_at >= ? AND sent_at < ?')
    .get(userId, from, to) as { n: number };
  return row.n;
}
