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

import type { Html } from './html';
import { clampToTelegram, truncateRenderedHtml } from './markdown';

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
 *
 * A fast double-tap that re-renders the identical screen makes Telegram answer
 * 400 "message is not modified" — a benign no-op we swallow so the error
 * boundary doesn't show the user a scary fallback. Other failures propagate.
 */
export async function editAnchor(
  ctx: Context,
  body: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await ctx.editMessageText(clampToTelegram(body), keyboard);
  } catch (err) {
    if (!isNotModified(err)) throw err;
  }
}

/**
 * Edit an anchor by explicit `messageId`, for handlers with no callback context
 * (e.g. a free-text step where the incoming update is the user's typed message,
 * not a tap on the anchor). Targets the anchor via `ctx.telegram.editMessageText`
 * using the current chat. Swallows the benign "not modified" 400 like
 * {@link editAnchor}.
 */
export async function editAnchorAt(
  ctx: Context,
  messageId: number,
  body: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  try {
    await ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      clampToTelegram(body),
      keyboard,
    );
  } catch (err) {
    if (!isNotModified(err)) throw err;
  }
}

// ─── HTML-aware siblings (ADR 011) ──────────────────────────────────────────
//
// Identical to the plain trio above but the body is branded {@link Html}, the
// length backstop is the tag-aware {@link truncateRenderedHtml} (never slices a
// tag or entity), and the send carries `parse_mode: 'HTML'`. The benign "message
// is not modified" 400 swallow is preserved. A surface opts into this lane
// explicitly (e.g. the `View.html` discriminator); nothing flips implicitly.

/** Send the anchor as HTML and capture its id for later in-place edits. */
export async function sendAnchorHtml(
  ctx: Context,
  body: Html,
  keyboard?: InlineKeyboard,
): Promise<Anchor> {
  const message = await ctx.reply(truncateRenderedHtml(body), {
    // eslint-disable-next-line no-restricted-syntax -- centralized HTML seam (ADR 011)
    parse_mode: 'HTML',
    ...keyboard,
  });
  return { messageId: message.message_id };
}

/** Edit the anchor in place as HTML. Mirrors {@link editAnchor}. */
export async function editAnchorHtml(
  ctx: Context,
  body: Html,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await ctx.editMessageText(truncateRenderedHtml(body), {
      // eslint-disable-next-line no-restricted-syntax -- centralized HTML seam (ADR 011)
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (err) {
    if (!isNotModified(err)) throw err;
  }
}

/** Edit an anchor by explicit `messageId` as HTML. Mirrors {@link editAnchorAt}. */
export async function editAnchorAtHtml(
  ctx: Context,
  messageId: number,
  body: Html,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  try {
    await ctx.telegram.editMessageText(chatId, messageId, undefined, truncateRenderedHtml(body), {
      // eslint-disable-next-line no-restricted-syntax -- centralized HTML seam (ADR 011)
      parse_mode: 'HTML',
      ...keyboard,
    });
  } catch (err) {
    if (!isNotModified(err)) throw err;
  }
}

function isNotModified(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { response?: { error_code?: number; description?: string } };
  return (
    e.response?.error_code === 400 && /message is not modified/i.test(e.response.description ?? '')
  );
}
