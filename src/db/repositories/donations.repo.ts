/**
 * Append-only donations ledger (voluntary Telegram Stars tips). One row per
 * successful payment. The UNIQUE index on `telegram_charge_id` makes the
 * insert idempotent, so a redelivered `successful_payment` can't double-record.
 */

import { getDb } from '../connection';

export interface NewDonation {
  userId: number;
  starsAmount: number;
  telegramChargeId: string;
  /** Telegram's `provider_payment_charge_id`; empty string is normalized to null. */
  providerPaymentChargeId?: string | null;
}

export function recordDonation(input: NewDonation, now: number = Date.now()): void {
  const provider =
    input.providerPaymentChargeId && input.providerPaymentChargeId !== ''
      ? input.providerPaymentChargeId
      : null;
  getDb()
    .prepare(
      `INSERT INTO donations
         (user_id, stars_amount, telegram_charge_id, provider_payment_charge_id, created_at)
       VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (telegram_charge_id) DO NOTHING`,
    )
    .run(input.userId, input.starsAmount, input.telegramChargeId, provider, now);
}

export function totalStars(userId: number): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(stars_amount), 0) AS total FROM donations WHERE user_id = ?')
    .get(userId) as { total: number };
  return row.total;
}
