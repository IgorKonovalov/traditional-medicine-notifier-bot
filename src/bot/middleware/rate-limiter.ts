/**
 * Per-user fixed-window rate limiter. A cheap guard against a single user
 * flooding the bot (accidental double-taps, abuse). Backed by the in-memory
 * TTLMap; returns a `dispose` so boot can stop the sweeper on shutdown.
 */

import type { Context } from 'telegraf';

import { messages } from '../messages';
import { TTLMap } from '../state-manager';

export interface RateLimiterOptions {
  /** Max updates per window. Default 20. */
  max?: number;
  /** Window length in ms. Default 10_000. */
  windowMs?: number;
}

export function rateLimiter(options: RateLimiterOptions = {}): {
  middleware: (ctx: Context, next: () => Promise<void>) => Promise<void>;
  dispose: () => void;
} {
  const max = options.max ?? 20;
  const windowMs = options.windowMs ?? 10_000;
  const counts = new TTLMap<number, number>({ ttlMs: windowMs });

  const middleware = async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const id = ctx.from?.id;
    if (id === undefined) {
      await next();
      return;
    }
    const current = counts.get(id) ?? 0;
    if (current >= max) {
      // Silently drop callback floods; reply to message floods once.
      if (ctx.updateType === 'message') await ctx.reply(messages.common.rateLimited);
      return;
    }
    counts.set(id, current + 1);
    await next();
  };

  return { middleware, dispose: () => counts.dispose() };
}
