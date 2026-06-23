/**
 * /settings — currently the daily-tip opt-in toggle. Writes the
 * `SETTING_DAILY_TIP` user setting that the subscription dispatch reads.
 *
 * Skeleton: one toggle. Add reminder-timezone / quiet-hours / etc. here as the
 * settings surface grows.
 */

import { Markup, type Telegraf } from 'telegraf';

import { getSetting, setSetting, SETTING_DAILY_TIP } from '../../db/repositories/user.repo';
import { getUserId } from '../context';
import { messages } from '../messages';

function settingsKeyboard(dailyTipOn: boolean): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [
      dailyTipOn
        ? Markup.button.callback('🔕 Выключить совет дня', 'settings:tip:off')
        : Markup.button.callback('🔔 Включить совет дня', 'settings:tip:on'),
    ],
  ]);
}

export function registerSettingsCommand(bot: Telegraf): void {
  bot.command('settings', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.common.notRegistered);
      return;
    }
    const on = getSetting(userId, SETTING_DAILY_TIP) === '1';
    await ctx.reply(messages.settings.title, settingsKeyboard(on));
  });

  bot.action(/^settings:tip:(on|off)$/, async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.answerCbQuery(messages.common.notRegistered);
      return;
    }
    const turnOn = ctx.match[1] === 'on';
    setSetting(userId, SETTING_DAILY_TIP, turnOn ? '1' : '0');
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      turnOn ? messages.settings.dailyTipOn : messages.settings.dailyTipOff,
      settingsKeyboard(turnOn),
    );
  });
}
