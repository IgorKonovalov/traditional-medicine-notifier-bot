/**
 * Anchor-message helpers (ADR 009). A drilldown flow sends **one** message (the
 * *anchor*) and edits it in place on every transition, instead of piling a new
 * message onto the chat per step. `sendAnchor` opens the anchor and returns its
 * `message_id` (store it on the session); `editAnchor` re-renders it.
 *
 * Both clamp the body via the shared Telegram length logic and pass plain text —
 * no `parse_mode` (ADR 002). Inline keyboards carry the navigation chrome.
 */

import { Markup, type Context } from 'telegraf';

import { clampToTelegram } from './markdown';

type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

/** Coordinates of an anchor message, persisted on the flow's session. */
export interface Anchor {
  readonly messageId: number;
}

/** Send the anchor message and capture its id for later in-place edits. */
export async function sendAnchor(
  ctx: Context,
  body: string,
  keyboard?: InlineKeyboard,
): Promise<Anchor> {
  const message = await ctx.reply(clampToTelegram(body), keyboard);
  return { messageId: message.message_id };
}

/**
 * Edit the anchor in place. Call from within a callback handler whose tapped
 * message is the anchor (validated by the callback prologue), so the implicit
 * `editMessageText` target is correct.
 */
export async function editAnchor(
  ctx: Context,
  body: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await ctx.editMessageText(clampToTelegram(body), keyboard);
}
