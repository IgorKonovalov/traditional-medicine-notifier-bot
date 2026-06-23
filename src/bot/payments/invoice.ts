/**
 * Sends a Telegram Stars donation invoice. For Stars, `currency` is `XTR` and
 * `provider_token` is the empty string (no external payment provider).
 */

import type { Context } from 'telegraf';

import { buildDonationPayload } from './payload';
import type { DonationTier } from './tiers';

export async function sendDonationInvoice(ctx: Context, tier: DonationTier): Promise<void> {
  await ctx.replyWithInvoice({
    title: 'Поддержка проекта',
    description: `Добровольный донат: ${tier.label}`,
    payload: buildDonationPayload(tier.id),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: tier.label, amount: tier.stars }],
  });
}
