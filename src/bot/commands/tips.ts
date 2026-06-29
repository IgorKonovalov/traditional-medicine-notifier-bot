/**
 * /tips — show a tip on demand. A deliberately minimal entry for the
 * `💡 Советы` menu button. Unlike the proactive daily push (which keeps its
 * deterministic "Совет дня" selection), the on-demand surfaces serve a *random*
 * tip per tap (Plan 021), excluding the few each user saw most recently so
 * repeated taps feel fresh.
 */

import type { Context, Telegraf } from 'telegraf';

import type { Tip } from '../../content/types';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { messages } from '../messages';
import { toPlainText } from '../render/markdown';

import { getRecent, recordShown } from './tip-history';

/** Rotate the tip pool by local day so the same tip isn't shown all day. */
export function pickDailyTip(tips: readonly Tip[]): Tip | null {
  if (tips.length === 0) return null;
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return tips[dayIndex % tips.length] ?? null;
}

/**
 * Pick a uniformly-random tip whose `id` is not in `exclude`. Falls back to a
 * uniform pick over the full pool when every tip is excluded (corpus smaller
 * than the history window), and returns `null` only on an empty pool. Pure —
 * the history is passed in, never read here.
 */
export function pickRandomTip(tips: readonly Tip[], exclude: ReadonlySet<string>): Tip | null {
  if (tips.length === 0) return null;
  const pool = tips.filter((t) => !exclude.has(t.id));
  const candidates = pool.length > 0 ? pool : tips;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/** Show a random tip, avoiding this user's recent repeats. Shared by /tips and the menu. */
export async function tipsEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  const exclude = userId === undefined ? new Set<string>() : getRecent(userId);
  const tip = pickRandomTip(deps.content.tips.all, exclude);
  if (tip === null) {
    await ctx.reply(messages.tips.empty);
    return;
  }
  if (userId !== undefined) recordShown(userId, tip.id);
  await ctx.reply(messages.tip.random(toPlainText(tip.body), tip.source));
}

export function registerTipsCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('tips', (ctx) => tipsEntry(ctx, deps));
}
