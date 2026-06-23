/**
 * /reminders — list the user's scheduled reminders and let them cancel one.
 *
 * Skeleton: list + cancel are wired against the repo. The create-reminder flow
 * (collect label, herb link, recurrence, first fire time) is a multi-step
 * session and is left as a TODO — the data model and dispatch already support it.
 */

import { Markup, type Telegraf } from 'telegraf';

import { deactivateReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import { getUserId } from '../context';
import { messages } from '../messages';

function describe(recurrence: { kind: string }): string {
  switch (recurrence.kind) {
    case 'daily':
      return 'ежедневно';
    case 'weekly':
      return 'еженедельно';
    case 'interval':
      return 'по интервалу';
    default:
      return 'однократно';
  }
}

export function registerRemindersCommand(bot: Telegraf): void {
  bot.command('reminders', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.common.notRegistered);
      return;
    }
    const reminders = listUserReminders(userId).filter((r) => r.active);
    if (reminders.length === 0) {
      await ctx.reply(messages.reminders.empty);
      return;
    }
    const rows = reminders.map((r) => [
      Markup.button.callback(`❌ ${r.label} (${describe(r.recurrence)})`, `rem:cancel:${r.id}`),
    ]);
    await ctx.reply(messages.reminders.title, Markup.inlineKeyboard(rows));
  });

  bot.action(/^rem:cancel:(\d+)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    deactivateReminder(Number(ctx.match[1]), userId);
    await ctx.answerCbQuery(messages.reminders.cancelled);
    await ctx.editMessageText(messages.reminders.cancelled);
  });
}
