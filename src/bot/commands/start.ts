/**
 * /start — onboarding. Registers the user (ensure-user middleware already did)
 * and shows the welcome + disclaimer, establishing the persistent main menu.
 */

import type { Telegraf } from 'telegraf';

import { mainMenuKeyboard } from '../keyboards';
import { messages } from '../messages';

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    await ctx.reply(messages.start.welcome, mainMenuKeyboard());
  });
}
