/**
 * Create-reminder wizard (Plan 008) — the **pure** domain core (Plan 029 split):
 * the `ReminderDraft` shape plus the mappers that turn a finished draft into a
 * `RecurrenceSpec` and its first fire instant, and the pre-save validator. All
 * recurrence math delegates to `notifications/recurrence` — no offsets are
 * hand-rolled here (ADR 003 keeps the math pure and tz-correct). The Telegraf
 * wizard that drives these lives in the sibling view/registrar modules.
 */

import {
  addDays,
  computeNextFire,
  formatLocalDate,
  zonedWallTimeToEpoch,
} from '../../../notifications/recurrence';
import type { IntakeType, RecurrenceSpec } from '../../../notifications/types';

/** The recurrence kinds the wizard can build (mirrors `RecurrenceSpec`). */
export type RecurrenceKind = RecurrenceSpec['kind'];

/** Steps of the wizard, in nominal order; the active set depends on `kind`. */
export type ReminderStep =
  | 'label'
  | 'link'
  | 'intake'
  | 'kind'
  | 'every'
  | 'time'
  | 'date'
  | 'weekdays'
  | 'confirm';

/** Sub-screen of the `link` step: the type picker, or one of the two browsers. */
export type LinkView = 'choose' | 'herbs' | 'formulas';

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
  /** Optional content herb (ingredient) this reminder links to. */
  herbId?: string;
  /** Optional content formula (состав) this reminder links to. */
  combinationId?: string;
  /**
   * How a linked **formula** is taken (plan 024). Set only on the formula path;
   * the `intake` step is present only while `combinationId` is set.
   */
  intakeType?: IntakeType;
  /**
   * Active sub-screen of the `link` step: the `🌿 / 🧪 / ⏭` type picker
   * (`choose`, default) or one of the two browsers (`herbs` / `formulas`).
   */
  linkView?: LinkView;
  /**
   * Set when the herb was pre-linked at entry (herb-card `⏰ Напомнить` path).
   * Suppresses the in-wizard link + intake steps — the herb is already chosen.
   */
  herbPrelinked?: boolean;
  /** Current page of the herb picker (0-based). */
  herbPage?: number;
  /** Current page of the formula picker (0-based). */
  formulaPage?: number;
  kind?: RecurrenceKind;
  /**
   * Minute applied to an hour tap in the time grid: `:00` or `:30` (Plan 022).
   * Optional so in-flight sessions from before this field shipped keep working —
   * always read it through `?? '00'`.
   */
  minuteMode?: '00' | '30';
  /** Selected local `HH:MM` slots (deduped/sorted on use). */
  times: string[];
  /** Selected weekdays 0=Sun…6=Sat (weekly only). */
  weekdays: number[];
  /** Interval length in days (interval only). */
  everyDays?: number;
  /** Days from today for a one-shot (0=today, 1=tomorrow…). */
  dateOffset?: number;
  /** Set once the user opts out of a herb's default label, forcing free text. */
  customLabel?: boolean;
}

/** A fresh, empty draft. */
export function emptyDraft(): ReminderDraft {
  return { step: 'label', times: [], weekdays: [], minuteMode: '00' };
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
