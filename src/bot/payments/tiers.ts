/**
 * Donation tiers for voluntary Telegram Stars tipping. Stars are an integer
 * "currency" (`XTR`); `amount` is the star count.
 */

export interface DonationTier {
  readonly id: string;
  readonly stars: number;
  readonly label: string;
}

export const DONATION_TIERS: readonly DonationTier[] = [
  { id: 'small', stars: 50, label: '50 ⭐️' },
  { id: 'medium', stars: 150, label: '150 ⭐️' },
  { id: 'large', stars: 500, label: '500 ⭐️' },
];

export function tierById(id: string): DonationTier | undefined {
  return DONATION_TIERS.find((t) => t.id === id);
}
