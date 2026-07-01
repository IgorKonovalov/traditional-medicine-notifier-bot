/**
 * Proactive subscription / daily-tip dispatch.
 *
 * A node-cron job (default 09:00 local, `DAILY_TIP_CRON`) pushes a tip to every
 * user who opted in to the daily tip. Every send routes through
 * `notification-budget.ts`, so a user receives at most one proactive push per
 * calendar day even if other proactive surfaces (future per-category digests)
 * also fire.
 *
 * NOTE (skeleton): only the opt-in daily tip is wired. The topic-subscriptions
 * UI was retired in Plan 011, but the `subscriptions` table is retained under
 * the additive-only rule; per-category digests built from it remain a possible
 * future extension — not yet implemented.
 *
 * Per ADR 003 rule 3 this depends on the `Notifier` interface, not Telegraf.
 */

import { type ScheduledTask } from 'node-cron';

import { getSetting, listActiveUserIds, SETTING_DAILY_TIP } from '../db/repositories/user.repo';
import { getLogger } from '../logger';
import { startCronTick } from './cron-tick';
import { sendProactivePush, type BudgetContext } from './notification-budget';
import type { NotificationCta, Notifier } from './notifier';

export interface SubscriptionDispatchOptions {
  cronExpression: string;
  timezone: string;
  notifier: Notifier;
  /**
   * Selects the tip body (and optional CTA) for a given user. Returning `null`
   * skips that user this tick (e.g. nothing fresh to send).
   */
  selectTip: (userId: number) => { body: string; cta?: NotificationCta } | null;
}

export function startSubscriptionDispatch(options: SubscriptionDispatchOptions): ScheduledTask {
  return startCronTick({
    cronExpression: options.cronExpression,
    timezone: options.timezone,
    tick: () => runDailyTipTick(options),
    dispatchLabel: 'subscription',
    tickLabel: 'daily-tip',
  });
}

/** Single tick. `now` is injectable for deterministic tests. */
export async function runDailyTipTick(
  options: SubscriptionDispatchOptions,
  now: number = Date.now(),
): Promise<void> {
  const log = getLogger();
  const budget: BudgetContext = {
    notifier: options.notifier,
    now,
    timezone: options.timezone,
    logger: log,
  };

  for (const userId of listActiveUserIds()) {
    if (getSetting(userId, SETTING_DAILY_TIP) !== '1') continue;
    const tip = options.selectTip(userId);
    if (tip === null) continue;
    const send = tip.cta
      ? { userId, kind: 'daily-tip' as const, body: tip.body, cta: tip.cta }
      : { userId, kind: 'daily-tip' as const, body: tip.body };
    await sendProactivePush(budget, send);
  }
}
