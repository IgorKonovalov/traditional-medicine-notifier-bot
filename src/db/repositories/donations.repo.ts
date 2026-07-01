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

/**
 * Ledger-wide donation totals for the admin `/stats` readout (plan 032):
 * number of payments, summed Stars, and the timestamp of the most recent tip
 * (`null` when the ledger is empty).
 */
export interface DonationTotals {
  count: number;
  totalStars: number;
  mostRecentAt: number | null;
}

export function getDonationTotals(): DonationTotals {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(stars_amount), 0) AS totalStars,
              MAX(created_at) AS mostRecentAt
         FROM donations`,
    )
    .get() as { count: number; totalStars: number; mostRecentAt: number | null };
  return { count: row.count, totalStars: row.totalStars, mostRecentAt: row.mostRecentAt };
}
