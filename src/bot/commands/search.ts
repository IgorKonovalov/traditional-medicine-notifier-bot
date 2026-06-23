/**
 * /search <query> — case-insensitive substring match over herb names (Russian,
 * Latin, original). Using a command argument keeps the skeleton free of a
 * global text-capture session; a conversational search flow can replace this
 * later.
 */

import { Markup, type Telegraf } from 'telegraf';

import type { Herb } from '../../content/types';
import type { BotDeps } from '../context';
import { messages } from '../messages';

function matches(herb: Herb, q: string): boolean {
  const haystack = [herb.nameRu, herb.nameLatin, herb.nameOriginal].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export function registerSearchCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('search', async (ctx) => {
    const query = ctx.message.text.replace(/^\/search(@\w+)?\s*/i, '').trim().toLowerCase();
    if (query === '') {
      await ctx.reply(messages.search.prompt);
      return;
    }
    const hits = deps.content.herbs.all.filter((h) => matches(h, query)).slice(0, 20);
    if (hits.length === 0) {
      await ctx.reply(messages.search.nothingFound);
      return;
    }
    const rows = hits.map((h) => [Markup.button.callback(h.nameRu, `herb:${h.id}`)]);
    await ctx.reply(messages.browse.title, Markup.inlineKeyboard(rows));
  });
}
