/**
 * Top-level error boundary. Catches anything a handler throws, logs it with
 * structured context, and shows the user a friendly Russian fallback instead
 * of leaking a raw error. Never rethrows — one bad update must not crash the
 * polling loop.
 */

import type { Context } from 'telegraf';

import { getLogger } from '../../logger';
import { messages } from '../messages';

export function errorHandler() {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    try {
      await next();
    } catch (err) {
      getLogger().error(
        { err, updateType: ctx.updateType, from: ctx.from?.id },
        'unhandled error in bot handler',
      );
      try {
        await ctx.reply(messages.common.error);
      } catch {
        // Swallow secondary failures (e.g. the user blocked the bot mid-handler).
      }
    }
  };
}
