/**
 * Append-only delivery log. Records every notification the bot sends, keyed by
 * internal user id and `NotificationKind`. Powers the proactive daily-cap gate
 * (`services/notification-budget.ts`) and future analytics.
 */

import { getDb } from '../connection';
import { MS_PER_DAY } from '../../constants';
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
    .prepare(
      'SELECT COUNT(*) AS n FROM notification_log WHERE user_id = ? AND sent_at >= ? AND sent_at < ?',
    )
    .get(userId, from, to) as { n: number };
  return row.n;
}

/**
 * Proactive-push counts for the admin `/stats` readout (plan 032). "Proactive"
 * = the bot-initiated recurring surfaces (`daily-tip`, `digest`); the solicited
 * `reminder` kind is reported separately from the reminders table and excluded
 * here. `today` uses a **UTC** day boundary (epoch ms is UTC-aligned, so
 * flooring by MS_PER_DAY yields UTC midnight) for a stable operator metric,
 * independent of the per-user tz-aware daily cap; `last7d` is a rolling window.
 */
export interface ProactiveStats {
  today: number;
  last7d: number;
}

export function getProactiveStats(now: number = Date.now()): ProactiveStats {
  const db = getDb();
  const utcDayStart = Math.floor(now / MS_PER_DAY) * MS_PER_DAY;
  const count = (since: number): number =>
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM notification_log
             WHERE kind IN ('daily-tip', 'digest') AND sent_at >= ?`,
        )
        .get(since) as { n: number }
    ).n;
  return { today: count(utcDayStart), last7d: count(now - 7 * MS_PER_DAY) };
}
