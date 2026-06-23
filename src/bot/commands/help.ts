/**
 * /help — command reference + disclaimer.
 */

import type { Telegraf } from 'telegraf';

import { messages } from '../messages';

export function registerHelpCommand(bot: Telegraf): void {
  bot.help(async (ctx) => {
    await ctx.reply(messages.help.body);
  });
}
