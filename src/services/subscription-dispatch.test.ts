import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../db/test-helper';
import {
  ensureUser,
  getSetting,
  markInactive,
  setSetting,
  SETTING_DAILY_TIP,
  SETTING_LAST_PROACTIVE_PUSH,
} from '../db/repositories/user.repo';
import { formatDate } from '../utils/datetime';
import { runDailyTipTick, type SubscriptionDispatchOptions } from './subscription-dispatch';
import type { Notifier } from './notifier';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const TZ = 'Europe/Belgrade';

/** A notifier that always delivers and records who it sent to. */
function okNotifier(): { notifier: Notifier; sent: number[] } {
  const sent: number[] = [];
  return {
    sent,
    notifier: {
      send: async (userId) => {
        sent.push(userId);
        return 'ok';
      },
    },
  };
}

function baseOptions(
  notifier: Notifier,
  selectTip: SubscriptionDispatchOptions['selectTip'] = () => ({ body: 'совет дня' }),
): SubscriptionDispatchOptions {
  return { cronExpression: '0 9 * * *', timezone: TZ, notifier, selectTip };
}

/** Opt a freshly-created user in to the daily tip. */
function optedInUser(externalId: string): number {
  const userId = ensureUser(externalId, 'u');
  setSetting(userId, SETTING_DAILY_TIP, '1');
  return userId;
}

describe('runDailyTipTick — proactive daily-tip routing', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('delivers to opted-in users and stamps the daily-cap watermark', async () => {
    const userId = optedInUser('1');
    const { notifier, sent } = okNotifier();

    await runDailyTipTick(baseOptions(notifier), NOW);

    expect(sent).toEqual([userId]);
    // Routed through the budget gate: today's watermark is stamped.
    expect(getSetting(userId, SETTING_LAST_PROACTIVE_PUSH)).toBe(formatDate(NOW, TZ));
  });

  it('never delivers to a user who did not opt in', async () => {
    const optedIn = optedInUser('1');
    const optedOut = ensureUser('2', 'u'); // no daily_tip setting
    setSetting(ensureUser('3', 'u'), SETTING_DAILY_TIP, '0'); // explicit off
    const { notifier, sent } = okNotifier();

    await runDailyTipTick(baseOptions(notifier), NOW);

    expect(sent).toEqual([optedIn]);
    expect(sent).not.toContain(optedOut);
  });

  it('consults the budget gate per user — one already pushed today is skipped', async () => {
    const fresh = optedInUser('1');
    const alreadyPushed = optedInUser('2');
    setSetting(alreadyPushed, SETTING_LAST_PROACTIVE_PUSH, formatDate(NOW, TZ));
    const { notifier, sent } = okNotifier();

    await runDailyTipTick(baseOptions(notifier), NOW);

    expect(sent).toEqual([fresh]);
  });

  it('skips users for whom selectTip returns null (nothing fresh)', async () => {
    const withTip = optedInUser('1');
    const noTip = optedInUser('2');
    const { notifier, sent } = okNotifier();

    const selectTip = (userId: number) => (userId === noTip ? null : { body: 'совет дня' });
    await runDailyTipTick(baseOptions(notifier, selectTip), NOW);

    expect(sent).toEqual([withTip]);
  });

  it('ignores inactive users (dead chats)', async () => {
    const active = optedInUser('1');
    const inactive = optedInUser('2');
    markInactive(inactive);
    const { notifier, sent } = okNotifier();

    await runDailyTipTick(baseOptions(notifier), NOW);

    expect(sent).toEqual([active]);
  });
});
