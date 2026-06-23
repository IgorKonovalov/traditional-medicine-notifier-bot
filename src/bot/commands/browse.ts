/**
 * /browse — pick a tradition, then list its herbs as buttons that open the
 * herb page (`herb:<id>`). Reads the in-memory content corpus from deps.
 */

import { Markup, type Telegraf } from 'telegraf';

import type { Tradition } from '../../content/types';
import type { BotDeps } from '../context';
import { traditionPicker } from '../keyboards';
import { messages } from '../messages';

export function registerBrowseCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('browse', async (ctx) => {
    await ctx.reply(messages.browse.title, traditionPicker());
  });

  bot.action(/^tradition:(chinese|tibetan)$/, async (ctx) => {
    const tradition = ctx.match[1] as Tradition;
    const herbs = deps.content.herbs.all.filter((h) => h.tradition === tradition);
    await ctx.answerCbQuery();
    if (herbs.length === 0) {
      await ctx.editMessageText(messages.browse.empty);
      return;
    }
    const rows = herbs.map((h) => [Markup.button.callback(h.nameRu, `herb:${h.id}`)]);
    await ctx.editMessageText(messages.browse.title, Markup.inlineKeyboard(rows));
  });
}
