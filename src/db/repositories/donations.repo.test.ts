/**
 * Ledger-wide donation totals for the admin `/stats` readout (plan 032):
 * payment count, summed Stars, and the most-recent timestamp (null when empty).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../test-helper';
import { ensureUser } from './user.repo';
import { getDonationTotals, recordDonation } from './donations.repo';

describe('getDonationTotals', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('reports an empty ledger as zeros with a null timestamp', () => {
    expect(getDonationTotals()).toEqual({ count: 0, totalStars: 0, mostRecentAt: null });
  });

  it('counts payments, sums stars, and reports the most recent timestamp', () => {
    const userId = ensureUser('1', 'a');
    recordDonation({ userId, starsAmount: 50, telegramChargeId: 'c1' }, 1_000);
    recordDonation({ userId, starsAmount: 100, telegramChargeId: 'c2' }, 2_000);

    expect(getDonationTotals()).toEqual({ count: 2, totalStars: 150, mostRecentAt: 2_000 });
  });
});
