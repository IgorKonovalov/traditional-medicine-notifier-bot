/**
 * /reminders — list the user's active reminders, open one into a detail screen,
 * and create a new one. Each list row is an **open** button (`rem:open:<id>`)
 * that edits the message into a detail view (full schedule + linked ingredient/
 * formula + intake type); deletion lives only there (`rem:del:<id>`, immediate,
 * no confirm — Plan 024). The `➕ Новое` button hands off to the create wizard
 * (`rc:new`, Plan 008); the create flow itself lives in `reminder-create.ts`.
 *
 * The screen is a single message (not an anchored session): the id rides in the
 * callback data, so open / delete / back just re-render it in place.
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import { deactivateReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import { getUserTimezone } from '../../db/repositories/user.repo';
import type { ScheduledReminder } from '../../notifications/types';
import { formatDateTime } from '../../utils/datetime';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData } from '../keyboards';
import { messages } from '../messages';
import { describeReminder, intakeLabel } from './reminder-create';

/** Trim a label for a button face so the row stays compact. */
function shortLabel(label: string): string {
  return label.length > 40 ? `${label.slice(0, 39)}…` : label;
}

interface MsgView {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

/**
 * The linked-content lines for a reminder: the formula (with, when
 * `includeIntake`, its intake type) or the ingredient. Empty when the reminder
 * is unlinked or the stored id no longer resolves to content. Shared by the
 * list rows and the detail screen so both describe a link the same way.
 */
function linkLines(reminder: ScheduledReminder, deps: BotDeps, includeIntake: boolean): string[] {
  const rc = messages.reminderCreate;
  const out: string[] = [];
  if (reminder.combinationId !== null) {
    const name = deps.content.combinations.byId.get(reminder.combinationId)?.nameRu;
    if (name !== undefined) out.push(rc.formulaLine(name));
    if (includeIntake && reminder.intakeType !== null) {
      out.push(rc.intakeLine(intakeLabel(reminder.intakeType)));
    }
  } else if (reminder.herbId !== null) {
    const name = deps.content.herbs.byId.get(reminder.herbId)?.nameRu;
    if (name !== undefined) out.push(rc.herbLine(name));
  }
  return out;
}

/** The reminders list: a schedule block + an open button per active reminder. */
export function listView(userId: number, deps: BotDeps): MsgView {
  const timeZone = getUserTimezone(userId, deps.timezone);
  const reminders = listUserReminders(userId).filter((r) => r.active);
  const newRow = [Markup.button.callback(messages.reminders.newButton, 'rc:new')];

  if (reminders.length === 0) {
    return { text: messages.reminders.empty, keyboard: Markup.inlineKeyboard([newRow]) };
  }

  const blocks = reminders.map((r) => {
    const lines = [`• «${r.label}»`, `  ${describeReminder(r.recurrence, r.nextFireAt, timeZone)}`];
    if (r.recurrence.kind !== 'once') {
      lines.push(`  ${messages.reminders.nextFire(formatDateTime(r.nextFireAt, timeZone))}`);
    }
    // Surface the linked formula/ingredient on the row too (intake stays on the
    // detail screen to keep list rows compact).
    for (const link of linkLines(r, deps, false)) lines.push(`  ${link}`);
    return lines.join('\n');
  });

  const rows = reminders.map((r) => [
    Markup.button.callback(shortLabel(r.label), assertCallbackData(`rem:open:${r.id}`)),
  ]);
  rows.push(newRow);

  return {
    text: [messages.reminders.title, '', blocks.join('\n\n')].join('\n'),
    keyboard: Markup.inlineKeyboard(rows),
  };
}

/**
 * The per-reminder detail screen: full schedule + next fire + the linked
 * ingredient/formula (and, for a formula, its intake type), with 🗑 Удалить and
 * « Назад. Link names resolve from the in-memory content (Plan 024).
 */
export function detailView(reminder: ScheduledReminder, deps: BotDeps): MsgView {
  const tz = getUserTimezone(reminder.userId, deps.timezone);
  const lines = [
    messages.reminders.detailTitle,
    '',
    `«${reminder.label}»`,
    describeReminder(reminder.recurrence, reminder.nextFireAt, tz),
  ];
  if (reminder.recurrence.kind !== 'once') {
    lines.push(messages.reminders.nextFire(formatDateTime(reminder.nextFireAt, tz)));
  }
  lines.push(...linkLines(reminder, deps, true));

  return {
    text: lines.join('\n'),
    keyboard: Markup.inlineKeyboard([
      [
        Markup.button.callback(
          messages.reminders.deleteButton,
          assertCallbackData(`rem:del:${reminder.id}`),
        ),
      ],
      [Markup.button.callback(messages.nav.back, 'rem:list')],
    ]),
  };
}

/** Open the reminders list. Shared by /reminders and the menu. */
export async function remindersEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = listView(userId, deps);
  await ctx.reply(view.text, view.keyboard);
}

export function registerRemindersCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('reminders', (ctx) => remindersEntry(ctx, deps));

  // Open a reminder into its detail screen. A stale tap (already deleted) just
  // re-renders the list.
  bot.action(/^rem:open:(\d+)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    const reminder = listUserReminders(userId).find((r) => r.id === id && r.active);
    const view = reminder === undefined ? listView(userId, deps) : detailView(reminder, deps);
    await ctx.editMessageText(view.text, view.keyboard);
  });

  // Delete from the detail screen — immediate, no confirm (owner decision); then
  // re-render the list.
  bot.action(/^rem:del:(\d+)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    deactivateReminder(Number(ctx.match[1]), userId);
    await ctx.answerCbQuery(messages.reminders.cancelled);
    const view = listView(userId, deps);
    await ctx.editMessageText(view.text, view.keyboard);
  });

  // « Назад from the detail screen back to the list.
  bot.action(/^rem:list$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    await ctx.answerCbQuery();
    const view = listView(userId, deps);
    await ctx.editMessageText(view.text, view.keyboard);
  });
}
