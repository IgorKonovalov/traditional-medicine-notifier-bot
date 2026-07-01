/**
 * Human-readable recurrence summary (Plan 029 split) — shared by the wizard's
 * confirm screen and the reminders list. Also owns the weekday-name helpers the
 * weekday picker reuses, so Monday-first ordering lives in one place.
 */

import type { RecurrenceSpec } from '../../../notifications/types';
import { formatDateTime } from '../../../utils/datetime';
import { messages } from '../../messages';

const MON_FIRST = (wd: number): number => (wd + 6) % 7;

export function weekdayName(wd: number): string {
  return messages.reminderCreate.weekdayShort[wd] ?? '';
}

function weekdaysList(weekdays: readonly number[]): string {
  return [...weekdays]
    .sort((a, b) => MON_FIRST(a) - MON_FIRST(b))
    .map(weekdayName)
    .join(', ');
}

/**
 * One-line Russian summary of a reminder's schedule. `once` reads its concrete
 * next-fire instant (the spec carries no time); recurring kinds read the spec.
 */
export function describeReminder(
  recurrence: RecurrenceSpec,
  nextFireAt: number,
  timeZone: string,
): string {
  const rc = messages.reminderCreate;
  switch (recurrence.kind) {
    case 'daily':
      return rc.describeDaily(recurrence.times.join(', '));
    case 'weekly':
      return rc.describeWeekly(weekdaysList(recurrence.weekdays), recurrence.times.join(', '));
    case 'interval':
      return rc.describeInterval(recurrence.everyDays, recurrence.times.join(', '));
    case 'once':
    default:
      return rc.describeOnce(formatDateTime(nextFireAt, timeZone));
  }
}
