/**
 * /start — stepped onboarding (ADR 009). First-run edits one anchor: welcome +
 * disclaimer → daily-tip opt-in → finish on the persistent menu with a "что
 * дальше" pointer. The disclaimer is surfaced once here (ADR 006 / CLAUDE.md).
 *
 * Onboarding is idempotent: completing it sets `SETTING_ONBOARDED`, so a repeat
 * /start skips straight to the menu without re-prompting or rewriting the tip
 * preference. Callback scope `ob:`.
 */

import { Markup, type Telegraf } from 'telegraf';

import {
  getSetting,
  setSetting,
  SETTING_DAILY_TIP,
  SETTING_ONBOARDED,
} from '../../db/repositories/user.repo';
import { getUserId } from '../context';
import { mainMenuKeyboard } from '../keyboards';
import { messages } from '../messages';
import { editAnchor, sendAnchor } from '../render/anchor';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { requireSessionAndAnchor } from './_callback-prologue';

function tipOptInKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages.start.tipYes, 'ob:tip:yes')],
    [Markup.button.callback(messages.start.tipNo, 'ob:tip:no')],
  ]);
}

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.start.welcome, mainMenuKeyboard());
      return;
    }

    // Already onboarded → straight to the menu, no re-prompt (idempotent).
    if (getSetting(userId, SETTING_ONBOARDED) === '1') {
      await ctx.reply(messages.start.welcomeBack, mainMenuKeyboard());
      return;
    }

    deleteSession(userId, 'onboarding');
    const anchor = await sendAnchor(ctx, messages.start.onboardingIntro, tipOptInKeyboard());
    const session: AnchoredSession<Record<string, never>> = { anchor, state: {} };
    saveSession(userId, 'onboarding', session, SESSION_TTL_MS);
  });

  bot.action(/^ob:tip:(yes|no)$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'onboarding');
    if (v === null) return;
    const optIn = ctx.match[1] === 'yes';
    setSetting(v.userId, SETTING_DAILY_TIP, optIn ? '1' : '0');
    setSetting(v.userId, SETTING_ONBOARDED, '1');
    deleteSession(v.userId, 'onboarding');
    await ctx.answerCbQuery();
    // Edit the anchor to a confirmation (keyboard cleared), then land on the menu.
    await editAnchor(ctx, optIn ? messages.start.tipOnConfirm : messages.start.tipOffConfirm);
    await ctx.reply(messages.start.done, mainMenuKeyboard());
  });
}
