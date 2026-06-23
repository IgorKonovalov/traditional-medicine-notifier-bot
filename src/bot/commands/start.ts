/**
 * /start — onboarding. Registers the user (ensure-user middleware already did)
 * and shows the welcome + disclaimer.
 */

import type { Telegraf } from 'telegraf';

import { messages } from '../messages';

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    await ctx.reply(messages.start.welcome);
  });
}
