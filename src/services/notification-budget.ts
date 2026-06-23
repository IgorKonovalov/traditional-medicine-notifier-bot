/**
 * Notification budget — the single gate every PROACTIVE push routes through
 * (daily tips, topic digests). See docs/adr/004-notification-architecture.md.
 *
 * Rule: **at most one proactive push per user per calendar day**, tz-aware
 * (reuses `formatDate` so the day boundary matches the dispatch tick and the
 * backup filename). SOLICITED user-scheduled reminders do **not** route through
 * here — the user asked for those, so they are delivered on time regardless.
 *
 * Per ADR 003 rule 3 this stays behind the `Notifier` interface — no Telegraf
 * import. State is the `last_proactive_push_date` user setting (survives
 * restarts) plus an append to `notification_log`.
 */

import type { Logger } from 'pino';

import { getSetting, setSetting, SETTING_LAST_PROACTIVE_PUSH } from '../db/repositories/user.repo';
import { logNotification } from '../db/repositories/notification-log.repo';
import { formatDate } from '../utils/datetime';
import type { NotificationKind } from '../notifications/types';
import type { NotificationCta, Notifier } from './notifier';

/** Which proactive path is sending. Solicited reminders are deliberately absent. */
export type ProactiveKind = Extract<NotificationKind, 'daily-tip' | 'digest'>;

export interface ProactiveSend {
  readonly userId: number;
  readonly kind: ProactiveKind;
  /** Main body, pulled from `messages.ts`. */
  readonly body: string;
  /** Optional in-domain action hint, forwarded to the Notifier verbatim. */
  readonly cta?: NotificationCta;
}

export interface BudgetContext {
  readonly notifier: Notifier;
  /** Reference instant (ms) — typically `Date.now()`. */
  readonly now: number;
  /** Bot timezone for the calendar-day boundary. */
  readonly timezone: string;
  readonly logger: Logger;
}

export type ProactiveOutcome =
  | 'sent'
  | 'skipped-already-pushed'
  | 'failed-permanent'
  | 'failed-transient';

/**
 * Deliver one proactive push, subject to the daily cap.
 *
 *   - If the user already received a proactive push today → skip and log.
 *   - Otherwise send via the Notifier. On `ok`, record today's date (so the
 *     cap holds for the rest of the day and survives a restart) and append to
 *     `notification_log`.
 *   - On failure the date is **not** recorded, so a later push the same day can
 *     retry. Permanent failures have already flipped `active=0` in the Notifier.
 */
export async function sendProactivePush(ctx: BudgetContext, send: ProactiveSend): Promise<ProactiveOutcome> {
  const today = formatDate(ctx.now, ctx.timezone);
  const last = getSetting(send.userId, SETTING_LAST_PROACTIVE_PUSH);

  if (last === today) {
    ctx.logger.info({ userId: send.userId, kind: send.kind, reason: 'daily-cap' }, 'proactive push skipped');
    return 'skipped-already-pushed';
  }

  const payload = send.cta ? { body: send.body, cta: send.cta } : { body: send.body };
  const result = await ctx.notifier.send(send.userId, payload);

  if (result === 'ok') {
    setSetting(send.userId, SETTING_LAST_PROACTIVE_PUSH, today);
    logNotification(send.userId, send.kind, ctx.now);
    ctx.logger.info({ userId: send.userId, kind: send.kind }, 'proactive push sent');
    return 'sent';
  }

  if (result === 'permanent-failure') {
    ctx.logger.debug({ userId: send.userId, kind: send.kind }, 'proactive push permanent failure');
    return 'failed-permanent';
  }
  ctx.logger.warn({ userId: send.userId, kind: send.kind }, 'proactive push delivery failed (transient)');
  return 'failed-transient';
}
