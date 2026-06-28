/**
 * /tips — show the day's rotating tip. A deliberately minimal entry for the
 * `💡 Советы` menu button; Plan 005 expands this into a full tips browser onto
 * the navigation kit. Rendering mirrors the proactive daily-tip push so the
 * solicited and proactive surfaces read identically.
 */

import type { Context, Telegraf } from 'telegraf';

import type { Tip } from '../../content/types';
import type { BotDeps } from '../context';
import { messages } from '../messages';
import { toPlainText } from '../render/markdown';

/** Rotate the tip pool by local day so the same tip isn't shown all day. */
export function pickDailyTip(tips: readonly Tip[]): Tip | null {
  if (tips.length === 0) return null;
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return tips[dayIndex % tips.length] ?? null;
}

/** Show today's tip. Shared by /tips and the menu. */
export async function tipsEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const tip = pickDailyTip(deps.content.tips.all);
  if (tip === null) {
    await ctx.reply(messages.tips.empty);
    return;
  }
  await ctx.reply(messages.tip.daily(toPlainText(tip.body), tip.source));
}

export function registerTipsCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('tips', (ctx) => tipsEntry(ctx, deps));
}
