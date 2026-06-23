/**
 * Pure scheduling decisions over a set of reminders. The IO (reading due rows,
 * delivering, writing the advanced fire time) lives in
 * `services/reminder-dispatch.ts`; this module only decides *what* and *when*.
 */

import { computeNextFire } from './recurrence';
import type { ScheduledReminder } from './types';

/** Active reminders whose fire time has arrived at `now`. */
export function selectDueReminders(reminders: readonly ScheduledReminder[], now: number): ScheduledReminder[] {
  return reminders.filter((r) => r.active && r.nextFireAt <= now);
}

/**
 * The next fire time for a reminder after it fires at `firedAt`, or `null` when
 * it should be deactivated (a one-shot, or a schedule with no future slot).
 */
export function advanceReminder(
  reminder: ScheduledReminder,
  firedAt: number,
  timeZone: string,
): number | null {
  return computeNextFire(reminder.recurrence, firedAt, timeZone);
}
