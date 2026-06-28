/**
 * Create-reminder wizard (Plan 008) — the headline solicited-reminder feature,
 * wired onto the navigation shell (ADR 009). A single anchor message is edited
 * per step; the draft lives in a `reminder-create` session keyed by internal
 * `user_id`.
 *
 * This top half is the **pure** core: the `ReminderDraft` shape plus the mappers
 * that turn a finished draft into a `RecurrenceSpec` and its first fire instant.
 * It delegates all recurrence math to `notifications/recurrence` — no offsets are
 * hand-rolled here (ADR 003 keeps the math pure and tz-correct). The Telegraf
 * wizard that drives these is the lower half of the file.
 */

import {
  addDays,
  computeNextFire,
  formatLocalDate,
  zonedWallTimeToEpoch,
} from '../../notifications/recurrence';
import type { RecurrenceSpec } from '../../notifications/types';

/** The recurrence kinds the wizard can build (mirrors `RecurrenceSpec`). */
export type RecurrenceKind = RecurrenceSpec['kind'];

/** Steps of the wizard, in nominal order; the active set depends on `kind`. */
export type ReminderStep = 'label' | 'kind' | 'every' | 'time' | 'date' | 'weekdays' | 'confirm';

/** Max label length — it is echoed back verbatim in every fired notification. */
export const LABEL_MAX = 100;

/**
 * In-flight wizard state, persisted as the `state` of an `AnchoredSession`.
 * Which fields matter depends on `kind`: `weekdays` (weekly), `everyDays`
 * (interval), `dateOffset` (once — days from today). `times` are local `HH:MM`.
 */
export interface ReminderDraft {
  step: ReminderStep;
  label?: string;
  /** Optional content herb this reminder links to. */
  herbId?: string;
  kind?: RecurrenceKind;
  /** Selected local `HH:MM` slots (deduped/sorted on use). */
  times: string[];
  /** Selected weekdays 0=Sun…6=Sat (weekly only). */
  weekdays: number[];
  /** Interval length in days (interval only). */
  everyDays?: number;
  /** Days from today for a one-shot (0=today, 1=tomorrow…). */
  dateOffset?: number;
}

/** A fresh, empty draft. */
export function emptyDraft(): ReminderDraft {
  return { step: 'label', times: [], weekdays: [] };
}

/** Reason a draft cannot yet be saved, or `null` when it is valid. */
export type DraftError = 'label' | 'kind' | 'every' | 'time' | 'weekday' | 'past';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Deduped, validity-filtered, ascending list of the draft's selected times. */
export function normalizeTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => TIME_RE.test(t)))].sort();
}

/**
 * Map a (validated) draft to the persisted `RecurrenceSpec`. A `once` reminder
 * carries no time/date in its spec — those are baked into `next_fire_at` via
 * {@link firstFireAt} and the spec is the bare `{ kind: 'once' }` sentinel.
 */
export function draftToRecurrence(draft: ReminderDraft): RecurrenceSpec {
  const times = normalizeTimes(draft.times);
  switch (draft.kind) {
    case 'daily':
      return { kind: 'daily', times };
    case 'weekly':
      return { kind: 'weekly', weekdays: [...draft.weekdays].sort((a, b) => a - b), times };
    case 'interval':
      return { kind: 'interval', everyDays: draft.everyDays ?? 1, times };
    case 'once':
    default:
      return { kind: 'once' };
  }
}

/**
 * First fire instant (epoch-ms) for a draft at `now`, or `null` when it has no
 * valid future slot (a `once` reminder whose chosen day+time already passed).
 *
 * Recurring kinds delegate to `computeNextFire`; `once` resolves the chosen
 * local day+time to an epoch via the same pure helpers and rejects the past.
 */
export function firstFireAt(draft: ReminderDraft, now: number, timeZone: string): number | null {
  const times = normalizeTimes(draft.times);
  if (draft.kind === 'once') {
    const time = times[0];
    if (time === undefined) return null;
    const date = addDays(formatLocalDate(now, timeZone), draft.dateOffset ?? 0);
    const epoch = zonedWallTimeToEpoch(date, time, timeZone);
    return epoch > now ? epoch : null;
  }
  return computeNextFire(draftToRecurrence(draft), now, timeZone);
}

/**
 * Gate a draft before persistence. Returns the first failing requirement (so the
 * wizard can keep the user on the relevant step) or `null` when it is ready.
 */
export function validateDraft(
  draft: ReminderDraft,
  now: number,
  timeZone: string,
): DraftError | null {
  if (draft.label === undefined || draft.label.trim() === '' || draft.label.length > LABEL_MAX) {
    return 'label';
  }
  if (draft.kind === undefined) return 'kind';
  if (draft.kind === 'interval' && !(draft.everyDays !== undefined && draft.everyDays >= 1)) {
    return 'every';
  }
  if (normalizeTimes(draft.times).length === 0) return 'time';
  if (draft.kind === 'weekly' && draft.weekdays.length === 0) return 'weekday';
  if (firstFireAt(draft, now, timeZone) === null) return 'past';
  return null;
}
