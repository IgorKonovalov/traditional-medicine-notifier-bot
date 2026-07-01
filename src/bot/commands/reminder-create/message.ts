/**
 * Fired-reminder notification payload (Plan 024, Plan 029 split). Pure (no IO),
 * so the reminder-dispatch `buildMessage` contract is unit-testable without
 * booting the app. `intakeLabel` is shared with the wizard's confirm screen.
 */

import type { IntakeType, ScheduledReminder } from '../../../notifications/types';
import type { NotificationPayload } from '../../../services/notifier';
import { messages } from '../../messages';

/** Display name of an intake type — for the confirm / detail / notification lines. */
export function intakeLabel(type: IntakeType): string {
  const rc = messages.reminderCreate;
  return type === 'decoction' ? rc.intakeDecoctionLabel : rc.intakePlainLabel;
}

/**
 * Resolves a linked content id to its display name for the fired-reminder body.
 * Passed in by the boot wiring (`src/index.ts`) so `buildReminderMessage` stays
 * pure and dependency-free — the dispatch layer owns the content handle.
 */
export interface ReminderContentNames {
  formulaName(id: string): string | undefined;
  herbName(id: string): string | undefined;
}

/**
 * Build the fired-reminder notification payload (the reminder-dispatch
 * `buildMessage`, plan 024). A formula reminder names the состав (and echoes its
 * intake type) in the body and carries an `open-formula` CTA; a herb reminder
 * names the ingredient and carries `open-herb`; a free-text reminder carries no
 * CTA. The linked name resolves from the optional `names` lookup — omitted (or
 * unresolved) it is simply skipped, so the payload degrades gracefully. A
 * reminder links to a formula **or** a herb, never both — formula takes
 * precedence defensively. Pure (no IO), so the dispatch contract is
 * unit-testable without booting the app.
 */
export function buildReminderMessage(
  reminder: ScheduledReminder,
  names?: ReminderContentNames,
): NotificationPayload {
  if (reminder.combinationId !== null) {
    const lines = [messages.reminder.body(reminder.label)];
    const name = names?.formulaName(reminder.combinationId);
    if (name !== undefined) lines.push(messages.reminderCreate.formulaLine(name));
    if (reminder.intakeType !== null) {
      lines.push(messages.reminderCreate.intakeLine(intakeLabel(reminder.intakeType)));
    }
    return {
      body: lines.join('\n'),
      cta: { kind: 'open-formula', combinationId: reminder.combinationId },
    };
  }
  if (reminder.herbId !== null) {
    const lines = [messages.reminder.body(reminder.label)];
    const name = names?.herbName(reminder.herbId);
    if (name !== undefined) lines.push(messages.reminderCreate.herbLine(name));
    return {
      body: lines.join('\n'),
      cta: { kind: 'open-herb', herbId: reminder.herbId },
    };
  }
  return { body: messages.reminder.body(reminder.label) };
}
