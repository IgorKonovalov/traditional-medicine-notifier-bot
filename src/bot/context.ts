/**
 * Bot-layer context helpers and the dependency bundle passed to command
 * registrars. Telegraf's `Context.state` is an untyped bag; we funnel the
 * resolved internal user id through typed accessors so handlers never poke at
 * raw `state` keys.
 */

import type { Context } from 'telegraf';

import type { LoadedContent } from '../content/types';

/** Everything the bot layer needs from boot, injected into `createBot`. */
export interface BotDeps {
  readonly content: LoadedContent;
  readonly timezone: string;
  readonly botUsername: string;
  readonly adminTelegramIds: ReadonlySet<string>;
}

/** Stash the internal user id resolved by the ensure-user middleware. */
export function setUserId(ctx: Context, userId: number): void {
  ctx.state['userId'] = userId;
}

/** Read the internal user id, or `undefined` if ensure-user hasn't run. */
export function getUserId(ctx: Context): number | undefined {
  const value = ctx.state['userId'];
  return typeof value === 'number' ? value : undefined;
}

/** True if the sender's Telegram id is in the admin allowlist. */
export function isAdmin(ctx: Context, adminTelegramIds: ReadonlySet<string>): boolean {
  const id = ctx.from?.id;
  return id !== undefined && adminTelegramIds.has(String(id));
}
