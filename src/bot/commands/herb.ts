/**
 * Global `herb:<id>` callback — the entry the notification "Открыть" CTA uses
 * (a standalone message, not part of a live drilldown). It opens the herb as a
 * fresh anchored library session (`openHerbCardAnchor`), so the card gets
 * back/home navigation and the render-time disclaimer (ADR 006).
 *
 * `remind:<id>` launches the create-reminder wizard (Plan 008) pre-linked to the
 * herb, offering its name as the default label.
 */

import type { Telegraf } from 'telegraf';

import type { BotDeps } from '../context';
import { openHerbCardAnchor } from './library';
import { reminderCreateEntry } from './reminder-create';

export { renderHerb } from './_herb-card';

export function registerHerbCommand(bot: Telegraf, deps: BotDeps): void {
  bot.action(/^herb:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await openHerbCardAnchor(ctx, deps, ctx.match[1] ?? '');
  });

  bot.action(/^remind:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const herbId = ctx.match[1] ?? '';
    const herb = deps.content.herbs.byId.get(herbId);
    await reminderCreateEntry(
      ctx,
      deps,
      herb !== undefined ? { herbId, herbName: herb.nameRu } : { herbId },
    );
  });
}
