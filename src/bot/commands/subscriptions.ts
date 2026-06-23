/**
 * /subscriptions — manage topic-category subscriptions (the proactive-feed
 * opt-in). Lists every content category with a subscribe/unsubscribe toggle.
 * Callback namespace `sub:` / `unsub:` operates on category ids.
 */

import { Markup, type Telegraf } from 'telegraf';

import {
  listUserSubscriptions,
  subscribe,
  unsubscribe,
} from '../../db/repositories/subscription.repo';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { messages } from '../messages';

function keyboard(deps: BotDeps, subscribed: ReadonlySet<string>): ReturnType<typeof Markup.inlineKeyboard> {
  const rows = deps.content.categories.all.map((c) => {
    const on = subscribed.has(c.id);
    return [
      on
        ? Markup.button.callback(`🔕 ${c.nameRu}`, `unsub:${c.id}`)
        : Markup.button.callback(`🔔 ${c.nameRu}`, `sub:${c.id}`),
    ];
  });
  return Markup.inlineKeyboard(rows);
}

function subscribedSet(userId: number): Set<string> {
  return new Set(listUserSubscriptions(userId).map((s) => s.category));
}

export function registerSubscriptionsCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('subscriptions', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.common.notRegistered);
      return;
    }
    await ctx.reply(messages.subscriptions.title, keyboard(deps, subscribedSet(userId)));
  });

  bot.action(/^(sub|unsub):(.+)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    const action = ctx.match[1];
    const category = ctx.match[2] ?? '';
    if (!deps.content.categories.byId.has(category)) {
      await ctx.answerCbQuery(messages.common.sessionExpired);
      return;
    }
    if (action === 'sub') {
      subscribe(userId, category);
      await ctx.answerCbQuery(messages.subscriptions.subscribed);
    } else {
      unsubscribe(userId, category);
      await ctx.answerCbQuery(messages.subscriptions.unsubscribed);
    }
    await ctx.editMessageReplyMarkup(keyboard(deps, subscribedSet(userId)).reply_markup);
  });
}
