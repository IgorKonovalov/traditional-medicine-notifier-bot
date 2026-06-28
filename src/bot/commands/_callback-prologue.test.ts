import type { Context } from 'telegraf';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import { ensureUser } from '../../db/repositories/user.repo';
import { type AnchoredSession, saveSession } from '../session-store';
import { requireSessionAndAnchor } from './_callback-prologue';

const TTL = 60_000;

/** Minimal fake context exercising only what the prologue reads. */
function makeCtx(opts: { userId?: number; tappedMessageId?: number }): {
  ctx: Context;
  answers: (string | undefined)[];
} {
  const answers: (string | undefined)[] = [];
  const ctx = {
    state: opts.userId !== undefined ? { userId: opts.userId } : {},
    callbackQuery:
      opts.tappedMessageId !== undefined
        ? { message: { message_id: opts.tappedMessageId } }
        : undefined,
    answerCbQuery: (text?: string): Promise<boolean> => {
      answers.push(text);
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, answers };
}

describe('requireSessionAndAnchor', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('returns null and acks when no user is resolved', async () => {
    const { ctx, answers } = makeCtx({ tappedMessageId: 1 });
    const result = await requireSessionAndAnchor(ctx, 'browse');
    expect(result).toBeNull();
    expect(answers).toHaveLength(1);
  });

  it('returns null and acks when no live session exists', async () => {
    const userId = ensureUser('2001', 'tester');
    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 42 });
    const result = await requireSessionAndAnchor(ctx, 'browse');
    expect(result).toBeNull();
    expect(answers).toHaveLength(1);
  });

  it('returns null and silently acks a stale tap on a superseded anchor', async () => {
    const userId = ensureUser('2002', 'tester');
    const session: AnchoredSession<{ step: number }> = {
      anchor: { messageId: 42 },
      state: { step: 1 },
    };
    saveSession(userId, 'browse', session, TTL);
    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 99 });

    const result = await requireSessionAndAnchor(ctx, 'browse');
    expect(result).toBeNull();
    expect(answers).toEqual([undefined]); // silent ack, no toast text
  });

  it('returns the validated user + session on a tap matching the anchor', async () => {
    const userId = ensureUser('2003', 'tester');
    const session: AnchoredSession<{ step: number }> = {
      anchor: { messageId: 42 },
      state: { step: 7 },
    };
    saveSession(userId, 'browse', session, TTL);
    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 42 });

    const result = await requireSessionAndAnchor<{ step: number }>(ctx, 'browse');
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(userId);
    expect(result?.session.state.step).toBe(7);
    expect(answers).toHaveLength(0); // happy path does not ack here — handler does
  });
});
