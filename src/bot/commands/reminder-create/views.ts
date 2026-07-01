/**
 * The wizard screen dispatcher (Plan 029 split): `view` renders the screen for a
 * draft's current step. The label, intake, and recurrence-selection screens
 * (kind / every / date / weekdays / confirm) live here; the time picker and the
 * link browsers are their own sibling modules.
 */

import { Markup } from 'telegraf';

import { MS_PER_DAY } from '../../../constants';
import type { BotDeps } from '../../context';
import { assertCallbackData } from '../../keyboards';
import { messages } from '../../messages';
import { formatDayLabel } from '../../../utils/datetime';
import { draftToRecurrence, firstFireAt, type ReminderDraft } from './draft';
import { describeReminder, weekdayName } from './describe';
import { linkView } from './link-view';
import { intakeLabel } from './message';
import { timeView } from './time-view';
import { type CallbackButton, chunk, navRow, type View } from './view-kit';

/** Interval lengths offered for the "каждые N дней" kind. */
const EVERY_OPTIONS = [2, 3, 5, 7, 10, 14, 30];
/** Day offsets offered for a one-shot's date picker (0=today … 6). */
const DATE_OFFSETS = [0, 1, 2, 3, 4, 5, 6];
/** Weekday buttons in Monday-first display order (values stay 0=Sun…6=Sat). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function labelView(draft: ReminderDraft): View {
  const rc = messages.reminderCreate;
  const herbMode = draft.herbId !== undefined && draft.customLabel !== true;
  if (herbMode && draft.label !== undefined) {
    return {
      text: rc.labelPromptHerb(draft.label),
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback(rc.useHerbName, 'rc:lbl:herb')],
        [Markup.button.callback(rc.enterCustom, 'rc:lbl:custom')],
        navRow(false),
      ]),
    };
  }
  const lines: string[] = [rc.labelPromptFree];
  const rows: CallbackButton[][] = [];
  if (draft.label !== undefined && draft.label.trim() !== '') {
    lines.push('', rc.labelCurrent(draft.label));
    rows.push([Markup.button.callback(rc.next, 'rc:next')]);
  }
  rows.push(navRow(false));
  return { text: lines.join('\n'), keyboard: Markup.inlineKeyboard(rows) };
}

/** The `intake` step (formula-only): plain warm water vs a decoction (отвар). */
function intakeView(): View {
  const rc = messages.reminderCreate;
  return {
    text: rc.intakePrompt,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(rc.intakePlain, 'rc:intake:plain')],
      [Markup.button.callback(rc.intakeDecoction, 'rc:intake:decoction')],
      navRow(true),
    ]),
  };
}

/**
 * Render the screen for the draft's current step. `timeZone` is the reminder
 * owner's effective zone (Plan 025); it defaults to the bot-global default so
 * render tests can call `view(draft, deps, now)` unchanged.
 * Exported for render tests.
 */
export function view(
  draft: ReminderDraft,
  deps: BotDeps,
  now: number,
  timeZone: string = deps.timezone,
): View {
  const rc = messages.reminderCreate;
  switch (draft.step) {
    case 'label':
      return labelView(draft);
    case 'link':
      return linkView(draft, deps);
    case 'intake':
      return intakeView();
    case 'kind':
      return {
        text: rc.kindPrompt(draft.label ?? ''),
        keyboard: Markup.inlineKeyboard([
          [
            Markup.button.callback(rc.kindOnce, 'rc:kind:once'),
            Markup.button.callback(rc.kindDaily, 'rc:kind:daily'),
          ],
          [
            Markup.button.callback(rc.kindWeekly, 'rc:kind:weekly'),
            Markup.button.callback(rc.kindInterval, 'rc:kind:interval'),
          ],
          navRow(true),
        ]),
      };
    case 'every': {
      const btns = EVERY_OPTIONS.map((n) =>
        Markup.button.callback(rc.everyLabel(n), assertCallbackData(`rc:every:${n}`)),
      );
      return {
        text: rc.everyPrompt,
        keyboard: Markup.inlineKeyboard([...chunk(btns, 4), navRow(true)]),
      };
    }
    case 'time':
      return timeView(draft);
    case 'date': {
      const btns = DATE_OFFSETS.map((off) => {
        const label =
          off === 0
            ? rc.dateToday
            : off === 1
              ? rc.dateTomorrow
              : formatDayLabel(now + off * MS_PER_DAY, timeZone);
        return Markup.button.callback(label, assertCallbackData(`rc:date:${off}`));
      });
      return {
        text: rc.datePrompt,
        keyboard: Markup.inlineKeyboard([...chunk(btns, 2), navRow(true)]),
      };
    }
    case 'weekdays': {
      const selected = new Set(draft.weekdays);
      const btns = WEEKDAY_ORDER.map((wd) =>
        Markup.button.callback(
          selected.has(wd) ? `✓ ${weekdayName(wd)}` : weekdayName(wd),
          assertCallbackData(`rc:wd:${wd}`),
        ),
      );
      return {
        text: rc.weekdaysPrompt,
        keyboard: Markup.inlineKeyboard([
          ...chunk(btns, 4),
          [Markup.button.callback(rc.next, 'rc:next')],
          navRow(true),
        ]),
      };
    }
    case 'confirm':
    default: {
      const at = firstFireAt(draft, now, timeZone);
      const recurrenceText =
        at === null
          ? rc.describeOnce('—')
          : describeReminder(draftToRecurrence(draft), at, timeZone);
      const summary = rc.summary(draft.label ?? '', recurrenceText, timeZone);
      const lines = [summary];
      if (draft.combinationId !== undefined) {
        const formulaName = deps.content.combinations.byId.get(draft.combinationId)?.nameRu;
        if (formulaName !== undefined) lines.push(rc.formulaLine(formulaName));
        if (draft.intakeType !== undefined)
          lines.push(rc.intakeLine(intakeLabel(draft.intakeType)));
      } else if (draft.herbId !== undefined) {
        const herbName = deps.content.herbs.byId.get(draft.herbId)?.nameRu;
        if (herbName !== undefined) lines.push(rc.herbLine(herbName));
      }
      const body = lines.join('\n');
      return {
        text: `${rc.confirmPrompt}\n\n${body}`,
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(rc.save, 'rc:save')],
          navRow(true),
        ]),
      };
    }
  }
}
