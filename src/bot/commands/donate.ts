/**
 * /donate — voluntary Telegram Stars tipping. Shows the tiers; tapping one
 * sends a Stars invoice. The pre-checkout and successful-payment lifecycle is
 * handled in `src/bot/payments/handlers.ts`.
 */

import { Markup, type Telegraf } from 'telegraf';

import { messages } from '../messages';
import { DONATION_TIERS, sendDonationInvoice, tierById } from '../payments';

export function registerDonateCommand(bot: Telegraf): void {
  bot.command('donate', async (ctx) => {
    const rows = DONATION_TIERS.map((t) => [Markup.button.callback(t.label, `donate:${t.id}`)]);
    await ctx.reply(messages.donate.intro, Markup.inlineKeyboard(rows));
  });

  bot.action(/^donate:(\w+)$/, async (ctx) => {
    const tier = tierById(ctx.match[1] ?? '');
    await ctx.answerCbQuery();
    if (tier === undefined) return;
    await sendDonationInvoice(ctx, tier);
  });
}
