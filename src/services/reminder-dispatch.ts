/**
 * Solicited-reminder dispatch (the user-scheduled notification path).
 *
 * A node-cron tick fires often (default every minute, `REMINDER_TICK_CRON`).
 * Each tick delivers every due `scheduled_reminders` row and advances it to its
 * next fire time via the pure `notifications/scheduler`. These deliveries are
 * **not** subject to the proactive daily cap — the user explicitly asked for
 * them — so they bypass `notification-budget.ts` and call the Notifier directly.
 *
 * Per ADR 003 rule 3 the scheduler depends on the `Notifier` interface, not on
 * Telegraf; the Telegraf-backed implementation is wired in `src/index.ts`.
 */

import { type ScheduledTask } from 'node-cron';

import { listDueReminders, setNextFire } from '../db/repositories/reminder.repo';
import { logNotification } from '../db/repositories/notification-log.repo';
import { getUserTimezone } from '../db/repositories/user.repo';
import { getLogger } from '../logger';
import { advanceReminder } from '../notifications/scheduler';
import type { ScheduledReminder } from '../notifications/types';
import { startCronTick } from './cron-tick';
import type { NotificationPayload, Notifier } from './notifier';

export interface ReminderDispatchOptions {
  cronExpression: string;
  timezone: string;
  notifier: Notifier;
  /** Builds the per-reminder message body. */
  buildMessage: (reminder: ScheduledReminder) => NotificationPayload;
}

export function startReminderDispatch(options: ReminderDispatchOptions): ScheduledTask {
  return startCronTick({
    cronExpression: options.cronExpression,
    timezone: options.timezone,
    tick: () => runReminderTick(options),
    dispatchLabel: 'reminder',
    tickLabel: 'reminder',
  });
}

/**
 * Single tick. `now` is injectable for deterministic tests. For each due
 * reminder: deliver, log, and advance `next_fire_at` (or deactivate a one-shot).
 */
export async function runReminderTick(
  options: ReminderDispatchOptions,
  now: number = Date.now(),
): Promise<void> {
  const log = getLogger();
  const due = listDueReminders(now);

  for (const reminder of due) {
    const result = await options.notifier.send(reminder.userId, options.buildMessage(reminder));
    if (result === 'ok') {
      logNotification(reminder.userId, 'reminder', now);
    } else if (result === 'transient-failure') {
      // Leave `next_fire_at` untouched so the next tick retries this reminder.
      log.warn(
        { reminderId: reminder.id, userId: reminder.userId },
        'reminder delivery failed (transient)',
      );
      continue;
    }
    // On 'ok' or 'permanent-failure' (dead chat), advance the schedule so a
    // blocked user doesn't wedge the row as perpetually due. The next local
    // fire time is resolved in the reminder owner's timezone (Plan 025), not
    // the bot-global default.
    const next = advanceReminder(reminder, now, getUserTimezone(reminder.userId, options.timezone));
    setNextFire(reminder.id, next);
  }
}
