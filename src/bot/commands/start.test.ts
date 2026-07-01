/**
 * Onboarding timezone step (Plan 025). Exercises the two `ob:` action handlers:
 * the tip choice advances to the timezone pick (onboarding not yet complete),
 * and the timezone pick persists the zone, marks onboarding done, and lands on
 * the menu.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import {
  ensureUser,
  getSetting,
  SETTING_DAILY_TIP,
  SETTING_ONBOARDED,
  SETTING_TIMEZONE,
} from '../../db/repositories/user.repo';
import type { BotDeps } from '../context';
import { messages } from '../messages';
import { type AnchoredSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { TIMEZONES } from '../timezones';
import { registerStartCommand } from './start';

type Handler = (ctx: Context) => Promise<unknown>;

const ANCHOR_ID = 42;

function captureActions(): Map<string, Handler> {
  const actions = new Map<string, Handler>();
  const stub = {
    start: () => {},
    action: (matcher: RegExp, handler: Handler) => {
      actions.set(matcher.source, handler);
    },
  } as unknown as Telegraf;
  const deps = { timezone: 'Europe/Belgrade' } as unknown as BotDeps;
  registerStartCommand(stub, deps);
  return actions;
}

interface Recorded {
  edits: string[];
  replies: string[];
}

function makeCtx(userId: number, matchArg?: string): { ctx: Context; rec: Recorded } {
  const rec: Recorded = { edits: [], replies: [] };
  const ctx = {
    state: { userId },
    callbackQuery: { message: { message_id: ANCHOR_ID } },
    answerCbQuery: () => Promise.resolve(true),
    editMessageText: (text: string) => {
      rec.edits.push(text);
      return Promise.resolve(true);
    },
    reply: (text: string) => {
      rec.replies.push(text);
      return Promise.resolve(true);
    },
    ...(matchArg !== undefined
      ? { match: [`ob:x:${matchArg}`, matchArg] as unknown as RegExpExecArray }
      : {}),
  } as unknown as Context;
  return { ctx, rec };
}

function seedOnboardingSession(externalId: string): number {
  const userId = ensureUser(externalId, 'u');
  const session: AnchoredSession<Record<string, never>> = {
    anchor: { messageId: ANCHOR_ID },
    state: {},
  };
  saveSession(userId, 'onboarding', session, SESSION_TTL_MS);
  return userId;
}

describe('onboarding: tip step advances to timezone', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('records the tip choice and shows the timezone prompt (not yet onboarded)', async () => {
    const userId = seedOnboardingSession('1');
    const handler = captureActions().get('^ob:tip:(yes|no)$');
    expect(handler).toBeDefined();

    const { ctx, rec } = makeCtx(userId, 'yes');
    await handler!(ctx);

    expect(getSetting(userId, SETTING_DAILY_TIP)).toBe('1');
    expect(getSetting(userId, SETTING_ONBOARDED)).toBeNull(); // still in progress
    expect(rec.edits.at(-1)).toBe(messages.start.timezonePrompt);
  });
});

describe('onboarding: timezone step completes onboarding', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('persists the chosen zone, marks onboarded, and lands on the menu', async () => {
    const userId = seedOnboardingSession('2');
    const handler = captureActions().get('^ob:tz:(\\d+)$');
    expect(handler).toBeDefined();

    const chosen = TIMEZONES[1]!; // Europe/Moscow
    const { ctx, rec } = makeCtx(userId, '1');
    await handler!(ctx);

    expect(getSetting(userId, SETTING_TIMEZONE)).toBe(chosen.id);
    expect(getSetting(userId, SETTING_ONBOARDED)).toBe('1');
    expect(rec.edits.at(-1)).toBe(messages.start.timezoneConfirm(chosen.label));
    expect(rec.replies.at(-1)).toBe(messages.start.done);
  });

  it('ignores an out-of-range index and does not complete onboarding', async () => {
    const userId = seedOnboardingSession('3');
    const handler = captureActions().get('^ob:tz:(\\d+)$');

    const { ctx } = makeCtx(userId, '999');
    await handler!(ctx);

    expect(getSetting(userId, SETTING_TIMEZONE)).toBeNull();
    expect(getSetting(userId, SETTING_ONBOARDED)).toBeNull();
  });
});
