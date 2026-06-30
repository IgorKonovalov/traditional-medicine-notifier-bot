/**
 * Telegraf-backed implementation of the domain `Notifier` interface
 * (`src/services/notifier.ts`). This is the only place outbound delivery
 * touches Telegraf; the dispatch schedulers and budget gate stay
 * framework-free (ADR 003 rule 3).
 *
 * Responsibilities:
 *   - resolve the Telegram chat id from the internal user id;
 *   - render an optional CTA as an inline keyboard;
 *   - classify failures into the tri-state `SendResult`, flipping a user to
 *     `active = 0` on a permanent (dead-chat) failure so future sends skip them.
 */

import { Markup, type Telegraf } from 'telegraf';

import { getTelegramId, markInactive } from '../db/repositories/user.repo';
import { getLogger } from '../logger';
import { messages } from './messages';
import { withRetry } from '../utils/retry';
import type {
  NotificationCta,
  NotificationPayload,
  Notifier,
  SendResult,
  UserId,
} from '../services/notifier';

export function createTelegrafNotifier(bot: Telegraf): Notifier {
  return {
    async send(userId: UserId, payload: NotificationPayload): Promise<SendResult> {
      const chatId = getTelegramId(userId);
      if (chatId === null) return 'permanent-failure';

      const extra = payload.cta ? buildCta(payload.cta) : undefined;
      try {
        await withRetry(() => bot.telegram.sendMessage(Number(chatId), payload.body, extra));
        return 'ok';
      } catch (err) {
        if (isPermanentFailure(err)) {
          markInactive(userId);
          return 'permanent-failure';
        }
        getLogger().warn({ err, userId }, 'notifier send failed (transient)');
        return 'transient-failure';
      }
    },
  };
}

export function buildCta(cta: NotificationCta): ReturnType<typeof Markup.inlineKeyboard> {
  // The bot's global callback router resolves `herb:<id>` to a herb card and
  // `formula:<id>` to a formula card (both open a fresh library session).
  const data = cta.kind === 'open-herb' ? `herb:${cta.herbId}` : `formula:${cta.combinationId}`;
  return Markup.inlineKeyboard([[Markup.button.callback(messages.notify.openCta, data)]]);
}

/**
 * A permanent failure is a dead chat: the bot was blocked, the account was
 * deactivated, or the chat no longer exists. Telegram surfaces these as 403s
 * and a handful of 400s.
 */
function isPermanentFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { response?: { error_code?: number; description?: string } };
  const code = e.response?.error_code;
  const desc = e.response?.description ?? '';
  if (code === 403) return true; // blocked / deactivated
  if (code === 400 && /chat not found|user is deactivated/i.test(desc)) return true;
  return false;
}
