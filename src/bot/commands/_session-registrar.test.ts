import type { Context, Telegraf } from 'telegraf';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import { ensureUser } from '../../db/repositories/user.repo';
import { type AnchoredSession, saveSession } from '../session-store';
import { onAck, onSession } from './_session-registrar';

const TTL = 60_000;

type ActionFn = (ctx: Context) => unknown;

/** Fake bot that captures the single handler a registrar registers, so a test
 *  can fire it directly with a fabricated callback context. */
function makeFakeBot(): { bot: Telegraf; fire: (ctx: Context) => Promise<void> } {
  let handler: ActionFn | null = null;
  const bot = {
    action: (_pattern: RegExp, fn: ActionFn) => {
      handler = fn;
    },
  } as unknown as Telegraf;
  const fire = async (ctx: Context): Promise<void> => {
    if (handler !== null) await handler(ctx);
  };
  return { bot, fire };
}

/** Minimal fake context exercising only what the prologue + registrar read. */
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

interface TestState {
  readonly step: number;
}

function seedSession(userId: number, messageId: number, step: number): void {
  const session: AnchoredSession<TestState> = { anchor: { messageId }, state: { step } };
  saveSession(userId, 'browse', session, TTL);
}

describe('onSession', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('runs the body with the validated session and acks on a live, anchored tap', async () => {
    const userId = ensureUser('3001', 'tester');
    seedSession(userId, 42, 7);
    const { bot, fire } = makeFakeBot();
    let seenStep: number | null = null;
    onSession<TestState>(bot, /^t:go$/, 'browse', (_ctx, v) => {
      seenStep = v.session.state.step;
      return Promise.resolve();
    });

    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 42 });
    await fire(ctx);

    expect(seenStep).toBe(7);
    expect(answers).toEqual([undefined]); // acked the spinner, no toast text
  });

  it('does not run the body when no session exists (acks with a toast)', async () => {
    const userId = ensureUser('3002', 'tester');
    const { bot, fire } = makeFakeBot();
    let ran = false;
    onSession<TestState>(bot, /^t:go$/, 'browse', () => {
      ran = true;
      return Promise.resolve();
    });

    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 42 });
    await fire(ctx);

    expect(ran).toBe(false);
    expect(answers).toHaveLength(1); // session-expired ack
  });

  it('does not run the body on a stale tap against a superseded anchor (silent ack)', async () => {
    const userId = ensureUser('3003', 'tester');
    seedSession(userId, 42, 1);
    const { bot, fire } = makeFakeBot();
    let ran = false;
    onSession<TestState>(bot, /^t:go$/, 'browse', () => {
      ran = true;
      return Promise.resolve();
    });

    const { ctx, answers } = makeCtx({ userId, tappedMessageId: 99 });
    await fire(ctx);

    expect(ran).toBe(false);
    expect(answers).toEqual([undefined]); // silent ack, no toast
  });
});

describe('onAck', () => {
  it('acknowledges the callback and does nothing else', async () => {
    const { bot, fire } = makeFakeBot();
    onAck(bot, /^t:noop$/);
    const { ctx, answers } = makeCtx({ tappedMessageId: 1 });
    await fire(ctx);
    expect(answers).toEqual([undefined]);
  });
});
