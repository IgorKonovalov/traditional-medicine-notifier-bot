/**
 * Proactive-push aggregate for the admin `/stats` readout (plan 032). Confirms
 * the UTC-day `today` boundary, the rolling 7-day window, and that the solicited
 * `reminder` kind is excluded from the proactive count.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MS_PER_DAY } from '../../constants';
import { setupTestDb, teardownTestDb } from '../test-helper';
import { ensureUser } from './user.repo';
import { getProactiveStats, logNotification } from './notification-log.repo';

describe('getProactiveStats', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('reports zeros against an empty log', () => {
    expect(getProactiveStats(100 * MS_PER_DAY)).toEqual({ today: 0, last7d: 0 });
  });

  it('counts daily-tip and digest within the UTC-day / 7-day windows, excluding reminders', () => {
    const dayStart = 100 * MS_PER_DAY; // UTC midnight
    const now = dayStart + 5 * 3_600_000; // 05:00 UTC on that day
    const userId = ensureUser('1', 'a');

    logNotification(userId, 'daily-tip', dayStart + 1_000); // today + 7d
    logNotification(userId, 'digest', dayStart - 2 * MS_PER_DAY); // 7d only
    logNotification(userId, 'reminder', dayStart + 500); // solicited → excluded
    logNotification(userId, 'daily-tip', now - 8 * MS_PER_DAY); // outside both windows

    expect(getProactiveStats(now)).toEqual({ today: 1, last7d: 2 });
  });
});
