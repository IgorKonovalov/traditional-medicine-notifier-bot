/**
 * Notifier — the abstraction every outbound message goes through.
 *
 * Dispatch schedulers (`reminder-dispatch`, `subscription-dispatch`) and the
 * budget gate depend on this interface, never on Telegraf directly. The
 * Telegraf-backed implementation lives in `src/bot/notifier.ts`; a future
 * codebase (mobile push, email) would supply its own implementation against
 * the same shape. See docs/adr/003-portability-discipline.md (rule 3).
 *
 * Interface-only by design — it makes the architectural seam visible in the
 * file tree with no logic to drift.
 */

/**
 * Internal user identifier — the bot's own primary key (`users.id`), never a
 * Telegram id (ADR 003 rule 1). The Notifier implementation resolves the
 * delivery channel (chat id) from this internally.
 */
export type UserId = number;

/**
 * Optional in-domain action hint a payload can carry. The Notifier adapter
 * renders it however its channel allows — for Telegraf, an inline keyboard
 * button; for a future mobile push, a deep link. Carries domain ids only so
 * the seam stays renderer-agnostic.
 */
export type NotificationCta = { kind: 'open-herb'; herbId: string };

/**
 * Pre-rendered, locale-correct message body. The Notifier does not localize or
 * template — it just delivers. Callers pull strings from `src/bot/messages.ts`.
 * Bodies are plain text with emoji for emphasis (no `parse_mode`, ADR 002).
 */
export interface NotificationPayload {
  readonly body: string;
  readonly cta?: NotificationCta;
}

/**
 * A single post-deploy "what's new" announcement (plan 010). Authored per
 * minor/major version in `src/bot/messages/version-announcements.ts` and
 * delivered once per user by the version-announcer. `priority` entries bypass
 * the `feature_announcements` opt-in gate (used for structurally important
 * changes — a new top-level command, a destructive change).
 *
 * Additive to the interface and framework-free by design (ADR 003): it carries
 * only a pre-rendered body and a domain `NotificationCta`, never Telegraf.
 */
export interface AnnouncementMessage {
  readonly body: string;
  readonly cta?: NotificationCta;
  readonly priority?: boolean;
}

/**
 * Tri-state send outcome.
 *   'ok'                 — delivered.
 *   'permanent-failure'  — the chat is dead (bot blocked, user deactivated,
 *                          chat not found). The Notifier has already flipped
 *                          the user to `active = 0`; callers need not retry.
 *   'transient-failure'  — network glitch, rate limit, 5xx. Try again later.
 */
export type SendResult = 'ok' | 'permanent-failure' | 'transient-failure';

export interface Notifier {
  send(userId: UserId, payload: NotificationPayload): Promise<SendResult>;
}
