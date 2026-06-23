/**
 * Per-update request logger. Emits one structured line per update with the
 * sender, update type, and handling duration. Useful for tracing and a cheap
 * latency signal.
 */

import type { Context } from 'telegraf';

import { getLogger } from '../../logger';

export function requestLogger() {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const start = Date.now();
    await next();
    getLogger().debug(
      { updateType: ctx.updateType, from: ctx.from?.id, ms: Date.now() - start },
      'update handled',
    );
  };
}
