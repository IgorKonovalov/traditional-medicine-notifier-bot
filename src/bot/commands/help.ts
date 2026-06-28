/**
 * /help — command reference + disclaimer. Re-sends the persistent main menu so
 * the keyboard is always one tap away after asking for help.
 */

import type { Context, Telegraf } from 'telegraf';

import { mainMenuKeyboard } from '../keyboards';
import { messages } from '../messages';

/** Show the help text. Shared by /help and the menu. */
export async function helpEntry(ctx: Context): Promise<void> {
  await ctx.reply(messages.help.body, mainMenuKeyboard());
}

export function registerHelpCommand(bot: Telegraf): void {
  bot.help(helpEntry);
}
