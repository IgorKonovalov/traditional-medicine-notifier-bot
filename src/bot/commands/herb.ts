/**
 * Global `herb:<id>` callback — the entry the notification "Открыть" CTA uses
 * (a standalone message, not part of a live drilldown). It opens the herb as a
 * fresh anchored browse session (`openHerbAnchor`), so the card gets back/home
 * navigation and the render-time disclaimer (ADR 006).
 *
 * `remind:<id>` is acknowledged but the create-reminder flow itself is Plan 008.
 */

import type { Telegraf } from 'telegraf';

import type { BotDeps } from '../context';
import { messages } from '../messages';
import { openHerbAnchor } from './browse';

export { renderHerb } from './_herb-card';

export function registerHerbCommand(bot: Telegraf, deps: BotDeps): void {
  bot.action(/^herb:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await openHerbAnchor(ctx, deps, ctx.match[1] ?? '');
  });

  bot.action(/^remind:(.+)$/, async (ctx) => {
    // TODO (Plan 008): launch the create-reminder flow prefilled with this herb.
    await ctx.answerCbQuery(messages.common.notImplemented);
  });
}
