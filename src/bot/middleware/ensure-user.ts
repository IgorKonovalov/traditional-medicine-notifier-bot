/**
 * Resolves (or creates) the internal user for every incoming update and stashes
 * the internal id on `ctx.state` for downstream handlers. Touching the user
 * here also re-activates anyone previously flipped inactive by a permanent send
 * failure — an incoming message proves the chat is alive again.
 *
 * Per ADR 003 rule 1 the Telegram id is passed as a string to `ensureUser`,
 * which stores it in `auth_identities` and returns the internal `users.id`.
 */

import type { Context } from 'telegraf';

import { ensureUser } from '../../db/repositories/user.repo';
import { setUserId } from '../context';

export function ensureUserMiddleware() {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const from = ctx.from;
    if (from === undefined || from.is_bot) {
      await next();
      return;
    }
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const username = from.username ?? (fullName === '' ? null : fullName);
    const userId = ensureUser(String(from.id), username);
    setUserId(ctx, userId);
    await next();
  };
}
