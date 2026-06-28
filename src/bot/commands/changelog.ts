/**
 * /changelog — retrospective view of per-version Russian release notes
 * (plan 010). Reads `messages.versionAnnouncements` directly; no separate
 * authoring track. The renderer is pure and lives in
 * `messages/version-announcements.ts` so this handler stays thin.
 *
 * Plaintext only (ADR 002): replies via the normal `ctx.reply` path, no
 * `parse_mode`.
 */

import type { Context, Telegraf } from 'telegraf';

import { messages } from '../messages';

export async function runChangelogEntry(ctx: Context): Promise<void> {
  await ctx.reply(messages.changelog.render(messages.versionAnnouncements));
}

export function registerChangelogCommand(bot: Telegraf): void {
  bot.command('changelog', (ctx) => runChangelogEntry(ctx));
}
