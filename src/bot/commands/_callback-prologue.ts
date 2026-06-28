/**
 * Shared callback prologue (ADR 009). Every inline-button handler in a drilldown
 * flow runs this first: it resolves the user, loads the live session for `kind`,
 * and confirms the tapped message **is** that session's anchor. Only then does it
 * hand back the validated `{ userId, session }`.
 *
 * Failure modes all `answerCbQuery()` (so Telegram clears the button spinner) and
 * return `null` — the handler must bail. A tap on a superseded anchor (the user
 * scrolled up and pressed an old keyboard) is silently no-op'd, per ADR 009.
 *
 * This is the single choke point for session-lifecycle correctness, so the
 * branches are unit-tested directly.
 */

import type { Context } from 'telegraf';

import { getUserId } from '../context';
import { messages } from '../messages';
import { type AnchoredSession, loadSession, type SessionKind } from '../session-store';

export interface ValidatedCallback<S> {
  readonly userId: number;
  readonly session: AnchoredSession<S>;
}

export async function requireSessionAndAnchor<S = unknown>(
  ctx: Context,
  kind: SessionKind,
): Promise<ValidatedCallback<S> | null> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.answerCbQuery(messages.common.notRegistered);
    return null;
  }

  const session = loadSession<AnchoredSession<S>>(userId, kind);
  if (session === null) {
    await ctx.answerCbQuery(messages.common.sessionExpired);
    return null;
  }

  const tappedMessageId = ctx.callbackQuery?.message?.message_id;
  if (tappedMessageId !== session.anchor.messageId) {
    // Stale tap on a superseded anchor — ack the spinner and no-op (ADR 009).
    await ctx.answerCbQuery();
    return null;
  }

  return { userId, session };
}
