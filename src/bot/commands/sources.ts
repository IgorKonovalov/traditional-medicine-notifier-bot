/**
 * /sources — short «Об источниках» page naming the texts the corpus draws on
 * (Чжуд-ши, Сова Ригпа, manla.ru). Reads `messages.sources` directly; the
 * handler stays thin.
 *
 * Plaintext only (ADR 002): replies via the normal `ctx.reply` path, no
 * `parse_mode`.
 */

import type { Context, Telegraf } from 'telegraf';

import { messages } from '../messages';

export async function runSourcesEntry(ctx: Context): Promise<void> {
  await ctx.reply(messages.sources.body);
}

export function registerSourcesCommand(bot: Telegraf): void {
  bot.command('sources', (ctx) => runSourcesEntry(ctx));
}
