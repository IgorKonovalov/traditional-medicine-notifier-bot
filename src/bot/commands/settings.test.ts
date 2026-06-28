/**
 * Settings hub — feature-announcements opt-in toggle (plan 010). Exercises the
 * `set:ann:toggle` action handler: the label reflects stored state, a tap
 * persists the flip to user_settings, and the anchor re-renders with the
 * confirmation line.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import {
  ensureUser,
  getSetting,
  setSetting,
  SETTING_FEATURE_ANNOUNCEMENTS,
} from '../../db/repositories/user.repo';
import type { BotDeps } from '../context';
import { messages } from '../messages';
import { type AnchoredSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { registerSettingsCommand } from './settings';

type Handler = (ctx: Context) => Promise<unknown>;

const ANCHOR_ID = 42;

/** Register the settings command against a stub, capturing action handlers by regex source. */
function captureActions(): Map<string, Handler> {
  const actions = new Map<string, Handler>();
  const stub = {
    command: () => {},
    action: (matcher: RegExp, handler: Handler) => {
      actions.set(matcher.source, handler);
    },
  } as unknown as Telegraf;
  const deps = { timezone: 'Europe/Moscow' } as unknown as BotDeps;
  registerSettingsCommand(stub, deps);
  return actions;
}

interface EditCall {
  text: string;
  keyboard: { reply_markup?: { inline_keyboard: { text: string }[][] } } | undefined;
}

function makeCtx(userId: number): { ctx: Context; edits: EditCall[] } {
  const edits: EditCall[] = [];
  const ctx = {
    state: { userId },
    callbackQuery: { message: { message_id: ANCHOR_ID } },
    answerCbQuery: () => Promise.resolve(true),
    editMessageText: (text: string, keyboard: EditCall['keyboard']) => {
      edits.push({ text, keyboard });
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, edits };
}

/** The announcements toggle is the second inline row, first button. */
function announcementsButtonLabel(edit: EditCall): string {
  return edit.keyboard?.reply_markup?.inline_keyboard?.[1]?.[0]?.text ?? '';
}

describe('settings: feature-announcements toggle', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  function seedSession(): number {
    const userId = ensureUser('1', 'u');
    const session: AnchoredSession<Record<string, never>> = {
      anchor: { messageId: ANCHOR_ID },
      state: {},
    };
    saveSession(userId, 'settings', session, SESSION_TTL_MS);
    return userId;
  }

  it('turns the setting on, persists "1", and re-renders the вкл label + confirmation', async () => {
    const userId = seedSession();
    const handler = captureActions().get('^set:ann:toggle$');
    expect(handler).toBeDefined();

    const { ctx, edits } = makeCtx(userId);
    await handler!(ctx);

    expect(getSetting(userId, SETTING_FEATURE_ANNOUNCEMENTS)).toBe('1');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.text).toContain(messages.settings.confirmAnnouncementsOn);
    expect(announcementsButtonLabel(edits[0]!)).toBe(messages.settings.announcementsLabelOn);
  });

  it('turns the setting off again when already on', async () => {
    const userId = seedSession();
    setSetting(userId, SETTING_FEATURE_ANNOUNCEMENTS, '1');
    const handler = captureActions().get('^set:ann:toggle$');

    const { ctx, edits } = makeCtx(userId);
    await handler!(ctx);

    expect(getSetting(userId, SETTING_FEATURE_ANNOUNCEMENTS)).toBe('0');
    expect(edits[0]!.text).toContain(messages.settings.confirmAnnouncementsOff);
    expect(announcementsButtonLabel(edits[0]!)).toBe(messages.settings.announcementsLabelOff);
  });
});
