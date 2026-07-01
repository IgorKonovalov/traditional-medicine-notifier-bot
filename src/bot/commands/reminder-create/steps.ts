/**
 * The wizard step graph (Plan 029 split): which steps exist for a draft and how
 * next/prev traverse them. Recomputed from the live draft, so linking a formula
 * (which sets `combinationId`) inserts the `intake` step and clearing it drops it.
 */

import type { RecurrenceKind, ReminderDraft, ReminderStep } from './draft';

/**
 * The step sequence for a given kind; drives next/prev and which steps exist.
 *
 * The `link` step (type picker → ingredient/formula browser) sits between
 * `label` and `kind`, present only when the link was **not** pre-chosen at entry
 * (the herb-card path already linked a herb, so `herbPrelinked` skips both link
 * and intake). The `intake` step follows `link` **only when a formula is linked**
 * (`hasFormula`) — ingredient and free-text reminders carry no intake type.
 *
 * `nextStep`/`prevStep` recompute this from the live draft, so picking a formula
 * (which sets `combinationId`) inserts `intake`, and switching to an ingredient
 * or skipping (which clears it) drops it again.
 */
export function stepsFor(
  kind: RecurrenceKind | undefined,
  herbPrelinked: boolean,
  hasFormula: boolean,
): ReminderStep[] {
  const head: ReminderStep[] = herbPrelinked
    ? ['label', 'kind']
    : hasFormula
      ? ['label', 'link', 'intake', 'kind']
      : ['label', 'link', 'kind'];
  switch (kind) {
    case 'once':
      return [...head, 'time', 'date', 'confirm'];
    case 'daily':
      return [...head, 'time', 'confirm'];
    case 'weekly':
      return [...head, 'time', 'weekdays', 'confirm'];
    case 'interval':
      return [...head, 'every', 'time', 'confirm'];
    default:
      return head;
  }
}

function stepsForDraft(draft: ReminderDraft): ReminderStep[] {
  return stepsFor(draft.kind, draft.herbPrelinked === true, draft.combinationId !== undefined);
}

export function nextStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsForDraft(draft);
  const i = steps.indexOf(draft.step);
  return steps[Math.min(i + 1, steps.length - 1)] ?? draft.step;
}

export function prevStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsForDraft(draft);
  const i = steps.indexOf(draft.step);
  return steps[Math.max(i - 1, 0)] ?? draft.step;
}
