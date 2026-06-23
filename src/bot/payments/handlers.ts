/**
 * Payment lifecycle handlers: approve every pre-checkout query, then record the
 * donation on `successful_payment`. The `donations` table's UNIQUE charge-id
 * index makes the insert idempotent if Telegram redelivers the callback.
 */

import type { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

import { recordDonation } from '../../db/repositories/donations.repo';
import { getLogger } from '../../logger';
import { getUserId } from '../context';
import { messages } from '../messages';

export function registerPaymentHandlers(bot: Telegraf): void {
  // Stars charges are instant; approve the pre-checkout so the client proceeds.
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on(message('successful_payment'), async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = getUserId(ctx);
    if (userId !== undefined) {
      recordDonation({
        userId,
        starsAmount: payment.total_amount,
        telegramChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id,
      });
    }
    getLogger().info({ userId, stars: payment.total_amount }, 'donation received');
    await ctx.reply(messages.donate.thanks);
  });
}
