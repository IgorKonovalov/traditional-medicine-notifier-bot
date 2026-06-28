/**
 * Feedback capture. Both `/feedback` (no argument) and the ✉️ Обратная связь
 * button arm a one-shot `feedback` capture session and prompt; the next plain
 * text message the user sends is relayed to the configured admins and logged,
 * then the session is cleared. The inline form `/feedback <text>` relays in one
 * shot without arming a session.
 *
 * Relay target (decided 2026-06-28): every Telegram id in `ADMIN_TELEGRAM_IDS`
 * (`config.adminTelegramIds`), DM'd directly via the bot. Telegram only delivers
 * to admins who have already started the bot; an unreachable admin is logged and
 * skipped, never surfaced to the user. With no admin configured the message is
 * still logged, so feedback is never silently lost.
 */

import type { Context, Telegraf } from 'telegraf';

import { getLogger } from '../../logger';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { messages } from '../messages';
import { deleteSession, loadSession, saveSession, SESSION_TTL_MS } from '../session-store';

/** Marker session: its mere presence arms the next-text capture. */
interface FeedbackSession {
  readonly pending: true;
}

/** Relay one feedback message to the server log and every configured admin. */
async function relayFeedback(
  ctx: Context,
  deps: BotDeps,
  fromUserId: number,
  text: string,
): Promise<void> {
  getLogger().info({ userId: fromUserId, text }, 'user feedback');
  const body = messages.feedback.adminRelay(fromUserId, text);
  for (const adminId of deps.adminTelegramIds) {
    try {
      await ctx.telegram.sendMessage(adminId, body);
    } catch (err) {
      getLogger().warn({ err, adminId }, 'feedback relay to admin failed');
    }
  }
}

/** Prompt for feedback and arm the one-shot capture. Shared by /feedback + hub. */
export async function feedbackEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  // Drop the reminder-create label capture (the only other text-capturing flow)
  // so it can't intercept the feedback reply if one was left parked.
  deleteSession(userId, 'reminder-create');
  const session: FeedbackSession = { pending: true };
  saveSession(userId, 'feedback', session, SESSION_TTL_MS);
  await ctx.reply(messages.feedback.prompt);
}

export function registerFeedbackCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('feedback', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.common.notRegistered);
      return;
    }
    const text = ctx.message.text.replace(/^\/feedback(@\w+)?\s*/i, '').trim();
    if (text === '') {
      // No inline text: arm the capture and prompt for a follow-up message.
      await feedbackEntry(ctx);
      return;
    }
    await relayFeedback(ctx, deps, userId, text);
    await ctx.reply(messages.feedback.sent);
  });
}

/**
 * Free-text feedback capture. Registered **after** the menu router (like the
 * reminder-create label capture) so a menu tap wins; consumes a plain text
 * message only while a `feedback` session is armed, and calls `next()` otherwise
 * so it never swallows unrelated messages.
 */
export function registerFeedbackTextCapture(bot: Telegraf, deps: BotDeps): void {
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await next();
      return;
    }
    const session = loadSession<FeedbackSession>(userId, 'feedback');
    if (session === null) {
      await next();
      return;
    }
    const msg = ctx.message;
    const text = msg !== undefined && 'text' in msg ? msg.text.trim() : '';
    if (text === '') {
      await next();
      return;
    }
    deleteSession(userId, 'feedback');
    await relayFeedback(ctx, deps, userId, text);
    await ctx.reply(messages.feedback.sent);
  });
}
