/**
 * Recompute stored reminder fire times when a user changes their timezone
 * (Plan 025). `scheduled_reminders.next_fire_at` is an absolute instant baked
 * from the old zone's wall-clock, so after a zone change every active
 * *recurring* reminder must be re-derived from its stored `HH:MM` recurrence in
 * the new zone — otherwise it keeps firing at the old zone's instants.
 *
 * `once` reminders carry no wall-clock time in their spec (only the baked
 * instant), so `computeNextFire` returns `null` for them and they are left
 * untouched — the "leave one-shots as-is" decision falls out for free (never
 * pass that `null` to `setNextFire`, which would deactivate the row).
 *
 * Pure-ish service: reads/writes via the reminder repo and computes via the
 * pure recurrence core — no Telegraf (ADR 003).
 */

import { listUserReminders, setNextFire } from '../db/repositories/reminder.repo';
import { computeNextFire } from '../notifications/recurrence';

/**
 * Re-derive `next_fire_at` for the user's active recurring reminders in
 * `timeZone`. Returns how many reminders had their fire time shifted.
 */
export function recomputeUserReminderFireTimes(
  userId: number,
  timeZone: string,
  now: number = Date.now(),
): number {
  let shifted = 0;
  for (const reminder of listUserReminders(userId)) {
    if (!reminder.active) continue;
    const next = computeNextFire(reminder.recurrence, now, timeZone);
    if (next === null) continue; // `once` / no future slot — leave as-is
    if (next !== reminder.nextFireAt) {
      setNextFire(reminder.id, next);
      shifted += 1;
    }
  }
  return shifted;
}
