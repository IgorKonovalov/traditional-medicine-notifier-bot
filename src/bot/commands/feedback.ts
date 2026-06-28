/**
 * /feedback <text> — relay a message to the developer. Inline-argument form
 * keeps the skeleton free of a global text-capture session; a prompt is shown
 * when the command arrives without text. Logged for now; routing to an admin
 * chat is a TODO.
 */

import type { Context, Telegraf } from 'telegraf';

import { getLogger } from '../../logger';
import { getUserId } from '../context';
import { messages } from '../messages';

/** Prompt the user to write feedback. Shared by /feedback (no arg) and the hub. */
export async function feedbackEntry(ctx: Context): Promise<void> {
  await ctx.reply(messages.feedback.prompt);
}

export function registerFeedbackCommand(bot: Telegraf): void {
  bot.command('feedback', async (ctx) => {
    const text = ctx.message.text.replace(/^\/feedback(@\w+)?\s*/i, '').trim();
    if (text === '') {
      await ctx.reply(messages.feedback.prompt);
      return;
    }
    // TODO: forward to the admin chat instead of only logging.
    getLogger().info({ userId: getUserId(ctx), text }, 'user feedback');
    await ctx.reply(messages.feedback.sent);
  });
}
