/**
 * Domain types for the notification subsystem. Pure — no Node, no Telegraf, no
 * DB. These describe the *shape* of a schedule; persistence (the DB row form)
 * and delivery (the Notifier) live in other layers.
 */

export type ReminderId = number;

/**
 * How a formula-linked reminder is taken (plan 024). `plain` — swallowed with
 * warm water; `decoction` — prepared as an отвар. Formula-only: ingredient and
 * free-text reminders carry no intake type.
 */
export type IntakeType = 'plain' | 'decoction';

/**
 * How a user-scheduled reminder repeats. Persisted as a JSON blob in
 * `scheduled_reminders.recurrence`. `times` are local `HH:MM` strings,
 * interpreted in the bot timezone.
 *
 * Kept deliberately small for the skeleton; extend (e.g. month-of-year,
 * end-date) behind a version tag when real scheduling lands.
 */
export type RecurrenceSpec =
  | { kind: 'once' }
  | { kind: 'daily'; times: string[] }
  | { kind: 'weekly'; weekdays: number[]; times: string[] } // weekday 0=Sun … 6=Sat
  | { kind: 'interval'; everyDays: number; times: string[] };

/** A user-created reminder (SOLICITED notification path). */
export interface ScheduledReminder {
  readonly id: ReminderId;
  readonly userId: number;
  readonly label: string;
  /** Optional link to a content herb id; `null` for a free-text reminder. */
  readonly herbId: string | null;
  /**
   * Optional link to a content formula (combination) id; `null` unless the
   * reminder was linked to a formula. A reminder links to a herb **or** a
   * formula, never both (plan 024).
   */
  readonly combinationId: string | null;
  /** How the linked formula is taken; `null` unless a formula is linked. */
  readonly intakeType: IntakeType | null;
  readonly recurrence: RecurrenceSpec;
  /** Epoch-ms of the next due delivery. */
  readonly nextFireAt: number;
  readonly active: boolean;
  readonly createdAt: number;
}

/** A user's subscription to a content category (PROACTIVE notification path). */
export interface Subscription {
  readonly userId: number;
  readonly category: string;
  readonly createdAt: number;
}

/**
 * Notification kinds recorded in `notification_log`. `reminder` is solicited
 * (no daily cap); `daily-tip` and `digest` are proactive (gated by the budget).
 */
export type NotificationKind = 'reminder' | 'daily-tip' | 'digest';
