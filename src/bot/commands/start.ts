/**
 * /start — stepped onboarding (ADR 009). First-run edits one anchor: welcome +
 * disclaimer → daily-tip opt-in → timezone pick → finish on the persistent menu
 * with a "что дальше" pointer. The disclaimer is surfaced once here (ADR 006 /
 * CLAUDE.md).
 *
 * Onboarding is idempotent: completing it (the timezone pick) sets
 * `SETTING_ONBOARDED`, so a repeat /start skips straight to the menu without
 * re-prompting or rewriting any preference. Callback scope `ob:`.
 */

import { Markup, type Telegraf } from 'telegraf';

import {
  getSetting,
  setSetting,
  SETTING_DAILY_TIP,
  SETTING_ONBOARDED,
  SETTING_TIMEZONE,
} from '../../db/repositories/user.repo';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, mainMenuKeyboard } from '../keyboards';
import { messages } from '../messages';
import { editAnchor, sendAnchor } from '../render/anchor';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { TIMEZONES } from '../timezones';
import { requireSessionAndAnchor } from './_callback-prologue';

function tipOptInKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages.start.tipYes, 'ob:tip:yes')],
    [Markup.button.callback(messages.start.tipNo, 'ob:tip:no')],
  ]);
}

/** The onboarding timezone picker; marks the bot-global default with a `✓`. */
function timezoneKeyboard(defaultZoneId: string): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard(
    TIMEZONES.map((tz, i) => [
      Markup.button.callback(
        tz.id === defaultZoneId ? `✓ ${tz.label}` : tz.label,
        assertCallbackData(`ob:tz:${i}`),
      ),
    ]),
  );
}

export function registerStartCommand(bot: Telegraf, deps: BotDeps): void {
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

  // Step 2: record the tip preference, then advance to the timezone pick.
  // Onboarding is not complete until a zone is chosen, so the session stays alive.
  bot.action(/^ob:tip:(yes|no)$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'onboarding');
    if (v === null) return;
    const optIn = ctx.match[1] === 'yes';
    setSetting(v.userId, SETTING_DAILY_TIP, optIn ? '1' : '0');
    await ctx.answerCbQuery();
    await editAnchor(ctx, messages.start.timezonePrompt, timezoneKeyboard(deps.timezone));
    const session: AnchoredSession<Record<string, never>> = { anchor: v.session.anchor, state: {} };
    saveSession(v.userId, 'onboarding', session, SESSION_TTL_MS);
  });

  // Final step: persist the chosen zone, mark onboarding done, land on the menu.
  bot.action(/^ob:tz:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'onboarding');
    if (v === null) return;
    const chosen = TIMEZONES[Number(ctx.match[1])];
    if (chosen === undefined) {
      await ctx.answerCbQuery();
      return;
    }
    setSetting(v.userId, SETTING_TIMEZONE, chosen.id);
    setSetting(v.userId, SETTING_ONBOARDED, '1');
    deleteSession(v.userId, 'onboarding');
    await ctx.answerCbQuery();
    await editAnchor(ctx, messages.start.timezoneConfirm(chosen.label));
    await ctx.reply(messages.start.done, mainMenuKeyboard());
  });
}
