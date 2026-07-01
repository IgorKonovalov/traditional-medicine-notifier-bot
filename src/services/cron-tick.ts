/**
 * Shared cron-tick scaffold for the dispatch services.
 *
 * `startReminderDispatch` and `startSubscriptionDispatch` had the identical
 * skeleton — validate the cron expression (throw at boot on a bad one),
 * `cron.schedule` a tick whose rejections are caught and logged so a single
 * failed tick never kills the schedule, then emit one startup log line. This
 * factors that skeleton out; the callers supply only the differing labels and
 * the tick body.
 *
 * Framework-free (ADR 003): depends on `node-cron` and the logger, never on
 * Telegraf. The tick itself stays in the owning dispatch service.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

import { getLogger } from '../logger';

export interface CronTickOptions {
  cronExpression: string;
  timezone: string;
  /**
   * Runs once per tick. A rejection is caught and logged as
   * `<tickLabel> tick failed`, never propagated — one bad tick must not tear
   * down the recurring schedule.
   */
  tick: () => Promise<void>;
  /** Startup log: emitted once as `<dispatchLabel> dispatch started`. */
  dispatchLabel: string;
  /** Per-tick failure log: `<tickLabel> tick failed`. */
  tickLabel: string;
}

/**
 * Wrap a tick so a rejection is caught and logged rather than propagated — a
 * failed tick logs and the schedule keeps firing. Exported (with an injectable
 * logger) so the swallow-and-log behavior is unit-testable without a live cron.
 */
export function guardTick(
  tick: () => Promise<void>,
  tickLabel: string,
  log: Logger = getLogger(),
): () => Promise<void> {
  return async () => {
    try {
      await tick();
    } catch (err) {
      log.error({ err }, `${tickLabel} tick failed`);
    }
  };
}

/**
 * Validate → schedule → catch-and-log → startup-log. Throws synchronously on an
 * invalid cron expression so a misconfiguration fails fast at boot rather than
 * silently never firing. Returns the scheduled task so callers can stop it.
 */
export function startCronTick(options: CronTickOptions): ScheduledTask {
  const log = getLogger();
  if (!cron.validate(options.cronExpression)) {
    throw new Error(`Invalid cron expression: ${options.cronExpression}`);
  }
  const guarded = guardTick(options.tick, options.tickLabel, log);
  const task = cron.schedule(options.cronExpression, () => void guarded(), {
    timezone: options.timezone,
  });
  log.info(
    { cron: options.cronExpression, tz: options.timezone },
    `${options.dispatchLabel} dispatch started`,
  );
  return task;
}
