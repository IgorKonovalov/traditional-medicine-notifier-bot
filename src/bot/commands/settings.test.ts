/**
 * Settings hub — feature-announcements opt-in toggle (plan 010). Exercises the
 * `set:ann:toggle` action handler: the label reflects stored state, a tap
 * persists the flip to user_settings, and the anchor re-renders with the
 * confirmation line.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import { createReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import {
  ensureUser,
  getSetting,
  setSetting,
  SETTING_FEATURE_ANNOUNCEMENTS,
  SETTING_TIMEZONE,
} from '../../db/repositories/user.repo';
import type { BotDeps } from '../context';
import { messages } from '../messages';
import { type AnchoredSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { TIMEZONES, timezoneLabel } from '../timezones';
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

  // Regression (Plan 025): a toggle must re-render the hub with the user's own
  // effective zone, not the bot-global fallback (deps.timezone = Europe/Moscow
  // in this suite). The user below runs on Europe/Belgrade.
  it('keeps the user timezone label after a daily-tip toggle', async () => {
    const userId = seedSession();
    setSetting(userId, SETTING_TIMEZONE, 'Europe/Belgrade');
    const handler = captureActions().get('^set:tip:toggle$');
    expect(handler).toBeDefined();

    const { ctx, edits } = makeCtx(userId);
    await handler!(ctx);

    expect(edits[0]!.text).toContain(messages.settings.timezone(timezoneLabel('Europe/Belgrade')));
    expect(edits[0]!.text).not.toContain(
      messages.settings.timezone(timezoneLabel('Europe/Moscow')),
    );
  });
});

describe('settings: timezone picker (Plan 025)', () => {
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

  /** ctx with a preset regex match, for the `set:tz:(\d+)` select handler. */
  function makeCtxMatch(userId: number, arg: string): { ctx: Context; edits: EditCall[] } {
    const { ctx, edits } = makeCtx(userId);
    (ctx as unknown as { match: RegExpExecArray }).match = [
      `set:tz:${arg}`,
      arg,
    ] as unknown as RegExpExecArray;
    return { ctx, edits };
  }

  it('opens the picker with a row per zone plus a back row', async () => {
    const userId = seedSession();
    const handler = captureActions().get('^set:tz:open$');
    expect(handler).toBeDefined();

    const { ctx, edits } = makeCtx(userId);
    await handler!(ctx);

    expect(edits[0]!.text).toBe(messages.settings.timezonePrompt);
    const rows = edits[0]!.keyboard?.reply_markup?.inline_keyboard ?? [];
    // One button per zone (2-col layout) plus a single back button.
    expect(rows.flat()).toHaveLength(TIMEZONES.length + 1);
  });

  it('persists the chosen zone and re-renders the hub with a confirmation', async () => {
    const userId = seedSession();
    const handler = captureActions().get('^set:tz:(\\d+)$');
    expect(handler).toBeDefined();

    // Index 1 = Europe/Moscow in the curated list.
    const chosen = TIMEZONES[1]!;
    const { ctx, edits } = makeCtxMatch(userId, '1');
    await handler!(ctx);

    expect(getSetting(userId, SETTING_TIMEZONE)).toBe(chosen.id);
    expect(edits[0]!.text).toContain(messages.settings.confirmTimezone(chosen.label));
    expect(edits[0]!.text).toContain(messages.settings.timezone(chosen.label));
  });

  it('recomputes the user active reminders into the new zone', async () => {
    const userId = seedSession();
    // A stale far-past fire time proves the recompute ran (it becomes a future slot).
    createReminder({
      userId,
      label: 'x',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    const handler = captureActions().get('^set:tz:(\\d+)$');

    const { ctx } = makeCtxMatch(userId, '0'); // Europe/Belgrade
    await handler!(ctx);

    const [r] = listUserReminders(userId);
    expect(r?.active).toBe(true);
    expect(r?.nextFireAt).toBeGreaterThan(Date.now());
  });

  it('ignores an out-of-range index', async () => {
    const userId = seedSession();
    const handler = captureActions().get('^set:tz:(\\d+)$');

    const { ctx, edits } = makeCtxMatch(userId, '999');
    await handler!(ctx);

    expect(getSetting(userId, SETTING_TIMEZONE)).toBeNull();
    expect(edits).toHaveLength(0);
  });
});
