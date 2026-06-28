/**
 * /reminders — list the user's active reminders and let them cancel one or
 * create a new one. Each row shows a human-readable schedule + next fire; the
 * `➕ Новое` button hands off to the create wizard (`rc:new`, Plan 008). The
 * create flow itself lives in `reminder-create.ts`.
 *
 * The list is a single message (not an anchored session): the cancel button
 * (`rem:cancel:<id>`) re-renders it in place, and `➕ Новое` opens a fresh
 * wizard anchor.
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import { deactivateReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import { formatDateTime } from '../../utils/datetime';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData } from '../keyboards';
import { messages } from '../messages';
import { describeReminder } from './reminder-create';

/** Trim a label for a button face so the row stays compact. */
function shortLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

interface ListView {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

function listView(userId: number, timeZone: string): ListView {
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
    return lines.join('\n');
  });

  const rows = reminders.map((r) => [
    Markup.button.callback(
      messages.reminders.rowCancel(shortLabel(r.label)),
      assertCallbackData(`rem:cancel:${r.id}`),
    ),
  ]);
  rows.push(newRow);

  return {
    text: [messages.reminders.title, '', blocks.join('\n\n')].join('\n'),
    keyboard: Markup.inlineKeyboard(rows),
  };
}

/** Open the reminders list. Shared by /reminders and the menu. */
export async function remindersEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = listView(userId, deps.timezone);
  await ctx.reply(view.text, view.keyboard);
}

export function registerRemindersCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('reminders', (ctx) => remindersEntry(ctx, deps));

  bot.action(/^rem:cancel:(\d+)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    deactivateReminder(Number(ctx.match[1]), userId);
    await ctx.answerCbQuery(messages.reminders.cancelled);
    const view = listView(userId, deps.timezone);
    await ctx.editMessageText(view.text, view.keyboard);
  });
}
