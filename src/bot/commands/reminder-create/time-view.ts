/**
 * The `time` step (Plan 022, Plan 029 split): a `:00` / `:30` minute-mode toggle
 * above an hour grid. The active mode sets the minute applied to an hour tap; a
 * reminder carries a single time, so a tap selects one slot (replacing any prior)
 * and the user confirms with «Далее».
 */

import { Markup } from 'telegraf';

import { assertCallbackData } from '../../keyboards';
import { messages } from '../../messages';
import type { ReminderDraft } from './draft';
import { type CallbackButton, chunk, navRow, type View } from './view-kit';

/**
 * Inclusive hour range offered in the picker grid (local wall-clock). Single
 * tunable constants — widen to `0…23` for night-time reminders (Plan 022 Risks),
 * or change `HOUR_COLS` for a different grid width.
 */
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS: readonly number[] = Array.from(
  { length: HOUR_END - HOUR_START + 1 },
  (_, i) => HOUR_START + i,
);
/** Hour buttons per grid row. */
const HOUR_COLS = 4;

/**
 * The `time` step: a `:00` / `:30` minute-mode toggle row above an hour grid
 * (Plan 022). The active mode (default `'00'`) sets the minute applied to an
 * hour tap. A reminder carries a **single** time (all kinds): tapping an hour
 * selects that one slot (replacing any prior) and is checkmarked; the user
 * confirms with «Далее». The chosen slot is echoed under a `Выбрано:` line.
 */
export function timeView(draft: ReminderDraft): View {
  const rc = messages.reminderCreate;
  const mode = draft.minuteMode ?? '00';
  const selected = new Set(draft.times);
  const toggleRow: CallbackButton[] = [
    Markup.button.callback(mode === '00' ? `✓ ${rc.minute00}` : rc.minute00, 'rc:min:00'),
    Markup.button.callback(mode === '30' ? `✓ ${rc.minute30}` : rc.minute30, 'rc:min:30'),
  ];
  const hourBtns = HOURS.map((h) => {
    const hh = String(h).padStart(2, '0');
    // Carry only the hour in the callback; the commit handler combines it with
    // the authoritative server-side `draft.minuteMode` (Plan 024 `.30` fix). The
    // checkmark stays keyed on the per-mode concrete slot.
    return Markup.button.callback(
      selected.has(`${hh}:${mode}`) ? `✓ ${hh}` : hh,
      assertCallbackData(`rc:time:${hh}`),
    );
  });
  const lines: string[] = [rc.timePrompt];
  const chosen = draft.times[0];
  if (chosen !== undefined) lines.push(rc.selectedTime(chosen));
  return {
    text: lines.join('\n'),
    keyboard: Markup.inlineKeyboard([
      toggleRow,
      ...chunk(hourBtns, HOUR_COLS),
      [Markup.button.callback(rc.next, 'rc:next')],
      navRow(true),
    ]),
  };
}
