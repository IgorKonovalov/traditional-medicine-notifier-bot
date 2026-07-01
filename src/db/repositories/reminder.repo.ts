/**
 * Persistence for user-scheduled reminders (the SOLICITED notification path).
 *
 * The `recurrence` column is a JSON blob; this repo is the single place that
 * (de)serializes it to the typed `RecurrenceSpec`, so callers always work with
 * the domain shape from `notifications/types.ts`.
 */

import { getDb } from '../connection';
import type {
  IntakeType,
  RecurrenceSpec,
  ReminderId,
  ScheduledReminder,
} from '../../notifications/types';

interface ReminderRow {
  id: number;
  user_id: number;
  label: string;
  herb_id: string | null;
  combination_id: string | null;
  intake_type: string | null;
  recurrence: string;
  next_fire_at: number;
  active: number;
  created_at: number;
}

function rowToReminder(row: ReminderRow): ScheduledReminder {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    herbId: row.herb_id,
    combinationId: row.combination_id,
    intakeType: row.intake_type as IntakeType | null,
    recurrence: JSON.parse(row.recurrence) as RecurrenceSpec,
    nextFireAt: row.next_fire_at,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export interface NewReminder {
  userId: number;
  label: string;
  herbId?: string | null;
  combinationId?: string | null;
  intakeType?: IntakeType | null;
  recurrence: RecurrenceSpec;
  nextFireAt: number;
}

export function createReminder(input: NewReminder, now: number = Date.now()): ReminderId {
  const result = getDb()
    .prepare(
      `INSERT INTO scheduled_reminders
         (user_id, label, herb_id, combination_id, intake_type, recurrence, next_fire_at, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.userId,
      input.label,
      input.herbId ?? null,
      input.combinationId ?? null,
      input.intakeType ?? null,
      JSON.stringify(input.recurrence),
      input.nextFireAt,
      now,
    );
  return Number(result.lastInsertRowid);
}

/** Active reminders whose next fire time has arrived. The dispatch tick's input. */
export function listDueReminders(now: number = Date.now()): ScheduledReminder[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM scheduled_reminders WHERE active = 1 AND next_fire_at <= ? ORDER BY next_fire_at',
    )
    .all(now) as ReminderRow[];
  return rows.map(rowToReminder);
}

export function listUserReminders(userId: number): ScheduledReminder[] {
  const rows = getDb()
    .prepare('SELECT * FROM scheduled_reminders WHERE user_id = ? ORDER BY created_at')
    .all(userId) as ReminderRow[];
  return rows.map(rowToReminder);
}

/** Advance a reminder to its next fire time (or deactivate a one-shot). */
export function setNextFire(id: ReminderId, nextFireAt: number | null): void {
  if (nextFireAt === null) {
    getDb().prepare('UPDATE scheduled_reminders SET active = 0 WHERE id = ?').run(id);
    return;
  }
  getDb()
    .prepare('UPDATE scheduled_reminders SET next_fire_at = ? WHERE id = ?')
    .run(nextFireAt, id);
}

export function deactivateReminder(id: ReminderId, userId: number): void {
  getDb()
    .prepare('UPDATE scheduled_reminders SET active = 0 WHERE id = ? AND user_id = ?')
    .run(id, userId);
}

/**
 * Global reminder counts for the admin `/stats` readout (plan 032):
 * `activeReminders` = live reminder rows, `usersWithReminders` = distinct users
 * who hold at least one — both scoped to `active = 1`.
 */
export interface ReminderStats {
  activeReminders: number;
  usersWithReminders: number;
}

export function getReminderStats(): ReminderStats {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS active, COUNT(DISTINCT user_id) AS users
         FROM scheduled_reminders WHERE active = 1`,
    )
    .get() as { active: number; users: number };
  return { activeReminders: row.active, usersWithReminders: row.users };
}
