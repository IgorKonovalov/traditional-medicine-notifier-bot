/**
 * Callback-registration helpers built on the shared prologue (ADR 009).
 *
 * Every drilldown `bot.action` handler had the identical scaffold — run
 * `requireSessionAndAnchor`, bail on `null`, `answerCbQuery`, then act on the
 * live session — copy-pasted ~30× (plus a fleet of no-op ack handlers). These
 * two registrars collapse that scaffold to a single call while preserving the
 * exact session-lifecycle semantics: a stale/absent/wrong-anchor tap is
 * acked-and-dropped, and the body runs only for a live, anchored session.
 *
 * `onSession` is generic over the session state `S` so it threads through
 * `requireSessionAndAnchor<S>` without any `any` (the codebase stays `any`-free).
 */

import { type Context, type NarrowedContext, type Telegraf, type Types } from 'telegraf';

import type { SessionKind } from '../session-store';
import { requireSessionAndAnchor, type ValidatedCallback } from './_callback-prologue';

/**
 * The context a regex `bot.action` handler receives: the callback-query-narrowed
 * context plus the regex `match`. Naming it lets extracted handler bodies read
 * `ctx.match[…]` with full typing instead of an inline arrow's inference.
 */
export type CallbackActionCtx = NarrowedContext<Context, Types.MountMap['callback_query']> & {
  readonly match: RegExpExecArray;
};

/**
 * Register a drilldown action: run the prologue, ack the spinner, and invoke
 * `body` only on a live, anchored session for `kind`. Stale/absent/wrong-anchor
 * taps are handled by the prologue (silent or toast ack + no-op) — `body` never
 * sees them.
 */
export function onSession<S = unknown>(
  bot: Telegraf,
  pattern: RegExp,
  kind: SessionKind,
  body: (ctx: CallbackActionCtx, session: ValidatedCallback<S>) => Promise<void>,
): void {
  bot.action(pattern, async (ctx) => {
    const v = await requireSessionAndAnchor<S>(ctx, kind);
    if (v === null) return;
    await ctx.answerCbQuery();
    await body(ctx, v);
  });
}

/**
 * Register a pure no-op acknowledgement — the edge-of-pager buttons whose only
 * job is to clear Telegram's button spinner. Replaces the repeated
 * `bot.action(/…:noop$/, (ctx) => ctx.answerCbQuery())`.
 */
export function onAck(bot: Telegraf, pattern: RegExp): void {
  bot.action(pattern, (ctx) => ctx.answerCbQuery());
}
