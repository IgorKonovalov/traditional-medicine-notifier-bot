/**
 * Rich-text Telegram-HTML render seam (ADR 011, amends ADR 002). The corpus
 * stays renderer-agnostic markdown; HTML is minted **here**, at render time, and
 * the branded {@link Html} type makes "an unescaped string reached a send site"
 * unrepresentable — the escaping footgun ADR 002 banned `parse_mode` to avoid.
 *
 * The single ways to mint an `Html` are the auto-escaping {@link html} tagged
 * template and {@link unsafeHtml} (for strings already known safe). `parse_mode:
 * 'HTML'` is permitted **only** in this file and the HTML-aware anchor helpers in
 * `anchor.ts`; everywhere else in `src/bot/` the ESLint ban stands. Both seam
 * sites carry a scoped `eslint-disable` with this justification.
 */

import type { Context } from 'telegraf';

import { escapeHtml } from './markdown';

// ─── branded type ───────────────────────────────────────────────────────────

/** A string known to be safe Telegram HTML (built through the seam). */
export type Html = string & { readonly __brand: 'html' };

/** Wrap a raw string as {@link Html} — use only when the string is already safe. */
export function unsafeHtml(s: string): Html {
  return s as Html;
}

// ─── tagged template ────────────────────────────────────────────────────────

/**
 * Tagged template that auto-escapes **every** interpolated value via
 * {@link escapeHtml}. Static template parts come from source code and are
 * trusted; interpolations are content and are always escaped — there is no
 * pass-through for nested `Html`, so a value cannot reach Telegram unescaped.
 *
 *   html`🧪 <b>${formula.nameRu}</b>`
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += escapeHtml(String(values[i]));
  }
  return out as Html;
}

// ─── Telegraf send helpers ──────────────────────────────────────────────────

type ReplyExtra = Parameters<Context['reply']>[1];
type EditExtra = Parameters<Context['editMessageText']>[1];

/** Reply with `parse_mode: 'HTML'`. The body must already be safe {@link Html}. */
export async function replyHtml(
  ctx: Context,
  body: Html,
  extra?: ReplyExtra,
): Promise<ReturnType<Context['reply']>> {
  // eslint-disable-next-line no-restricted-syntax -- centralized HTML seam (ADR 011)
  return ctx.reply(body, { parse_mode: 'HTML', ...extra });
}

/** Edit the message text with `parse_mode: 'HTML'`. Body must be safe {@link Html}. */
export async function editHtml(
  ctx: Context,
  body: Html,
  extra?: EditExtra,
): Promise<ReturnType<Context['editMessageText']>> {
  // eslint-disable-next-line no-restricted-syntax -- centralized HTML seam (ADR 011)
  return ctx.editMessageText(body, { parse_mode: 'HTML', ...extra });
}
